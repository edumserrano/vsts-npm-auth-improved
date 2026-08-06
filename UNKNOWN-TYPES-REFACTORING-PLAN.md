# Unknown Types Refactoring Plan

## Objective

Replace `unknown` and `Record<string, unknown>` where the repository already knows the value's semantic shape, while retaining `unknown` at genuine JavaScript trust boundaries. This is a type-safety refactor only: it must not change package generation, npm configuration, authentication, prompt interaction, or CLI behavior.

The audit covers authored source, tests, and test documentation in both:

- `projects/create-vsts-npm-auth-improved`
- `projects/vsts-npm-auth-improved`

Generated output, installed dependency directories, coverage/test reports, and snapshots containing only the word "unknown" are outside the implementation scope. The create package's manifest and lockfile changes required to add `type-fest` as a direct development dependency are in scope.

## Design principles

1. Give domain data a semantic name instead of using a generic string map.
2. Model only the fields and values this repository consumes; do not reproduce complete third-party package types.
3. Keep `unknown` where a value can genuinely be anything: caught exceptions, promise rejection reasons, unvalidated `require()` results, and type-guard inputs.
4. Validate external data before narrowing it to a semantic type.
5. Keep types local to an adapter or test helper unless two production modules genuinely share the same domain model.
6. Reuse `type-fest` for general JSON and standard `package.json` field types, but retain focused local types for values this repository validates or writes more narrowly.

## Phase 1: Model package JSON values

Target: `projects/create-vsts-npm-auth-improved/src/init-auth/package-files/npm-package-json-file.ts`

- Add `type-fest` as a direct development dependency of `create-vsts-npm-auth-improved`. Use type-only imports so this remains a type-safety change with no runtime dependency:

  ```ts
  import type { JsonObject, JsonValue } from "type-fest";

  type PackageJsonFieldValue = JsonValue | undefined;
  ```

- Use `JsonValue` for untrusted parsed package data and `JsonObject` after the existing root-object guard. Do not type raw `@npmcli/package-json` content as `PackageJson`: the adapter intentionally accepts and filters malformed `scripts` and dependency fields, so their semantic validity is not established until the field-level readers run.
- Retain the existing semantic `PackageScripts` and `PackageDependencies` types. They represent validated string maps more precisely than the broader standard package fields.
- Add `PackageJsonUpdate` containing only the fields written by this adapter:
  - `scripts`
  - `devDependencies`
  - optional `dependencies`
  - optional `optionalDependencies`
  - optional `peerDependencies`
- Change the local `NpmPackageJson` contract so `content` is `JsonValue` and `update` accepts `PackageJsonUpdate`.
- Change package-field readers and equality helpers from `unknown` to `PackageJsonFieldValue`.
- Add a small semantic shape for npm's JSON parse error and make `isJsonParseError` a typed predicate.
- Keep `unknown` on:
  - `NpmPackageJsonFileError` causes
  - the result of `require("@npmcli/package-json")` before validation
  - `isJsonObject` and `isJsonParseError` inputs
- Preserve the root-object check and all existing filtering of invalid script or dependency values.

Acceptance criteria:

- The package JSON adapter uses `type-fest` rather than maintaining its own recursive JSON model.
- The package JSON adapter has no generic data maps where a JSON or focused package JSON type is more accurate.
- Raw package content is not asserted to be a semantically valid `PackageJson` before its fields are validated.
- Switching between custom and standard installation strategies produces byte-for-byte equivalent semantic package data to the current implementation.
- Invalid JSON, non-object package roots, invalid scripts, and invalid dependency collections retain their current behavior.

## Phase 2: Model npm configuration data

Target: `projects/create-vsts-npm-auth-improved/src/init-auth/package-files/npm-config-file.ts`

- Introduce a recursive value model broad enough for npm configuration and flattened options:

  ```ts
  type NpmConfigPrimitive = string | number | boolean | null | undefined;
  type NpmConfigValue =
    | NpmConfigPrimitive
    | readonly NpmConfigValue[]
    | NpmConfigRecord;
  type NpmConfigRecord = { readonly [key: string]: NpmConfigValue };
  ```

- Use `NpmConfigRecord` for project `raw` data and the `get`, `set`, and `flatten` value surfaces.
- Add an opaque semantic `NpmConfigDefinition` object type and `NpmConfigDefinitions` map. The adapter passes definitions through but does not inspect their internal fields, so the type should not attempt to recreate all of `@npmcli/config`'s `Definition` class.
- Use mutable and readonly npm config record aliases where the `flatten` callback requires a mutable target.
- Change `normalizeRegistry` to accept `NpmConfigValue`; retain its runtime string check.
- Keep `unknown` on:
  - `NpmConfigFileError` causes
  - results of dynamic `require()` calls before validation
  - `isRecord` and `isNodeError` inputs
- Continue validating the CommonJS constructor and definitions module before casting them to the local adapter contracts.

Acceptance criteria:

- `NpmConfig`, `NpmConfigData`, and `NpmConfigDefinitionsModule` expose domain-specific types rather than `Record<string, unknown>`.
- Managed values (`package-lock`, `audit`, `fund`, `registry`, and `always-auth` keys) behave exactly as before.
- Loading and saving `.npmrc` files and reporting adapter errors remain unchanged.

## Phase 3: Type package JSON test fixtures and emitted package metadata

Targets:

- `projects/create-vsts-npm-auth-improved/tests/_test-utils/configuration-fixtures.ts`
- `projects/create-vsts-npm-auth-improved/tests/package-entrypoint.integration.test.ts`

Changes:

- Import `JsonObject`, `JsonValue`, and `PackageJson` from `type-fest` rather than adding a duplicate test-fixture JSON model.
- Replace fixture override maps with `PackageJsonFixtureOverrides = Readonly<JsonObject>`. Do not use `PackageJson` for fixtures because tests intentionally construct semantically invalid known fields while still requiring every override to be valid JSON.
- Derive the standard bin shape as `PackageBin = NonNullable<PackageJson["bin"]>` rather than recreating it locally.
- Keep the result of `JSON.parse` as `unknown`, validate that the package root is a `JsonObject`, and then treat its `bin` field as `JsonValue | undefined` until `resolveBinTarget` validates it. Use `PackageBin & JsonValue` as the successful validation target because `type-fest` permits `undefined` values in its partial object-form `bin` record while parsed JSON does not.
- Represent the emitted module with an `EmittedPublicApi`/`EmittedCliAsync` type guard.
- Keep the raw dynamic module result as `unknown` until that guard confirms `cliAsync` is callable.

Acceptance criteria:

- Fixture helpers accept every JSON-compatible override used by existing tests and reject non-JSON values at compile time.
- Package metadata types come from `type-fest`, while malformed fixture data and raw parsed JSON remain honestly typed until runtime validation succeeds.
- The emitted-package test still verifies the executable target and callable public API at runtime rather than relying only on a cast.

## Phase 4: Type terminal keypress metadata in both projects

Targets:

- `projects/create-vsts-npm-auth-improved/tests/_test-utils/prompts-interaction.ts`
- `projects/vsts-npm-auth-improved/tests/_test-utils/prompts-interaction.ts`

Changes:

- Import Node's keypress metadata type when available and define a focused `KeypressProperties` type from the supported modifier fields (`ctrl`, `meta`, and `shift`). If the Node type is unsuitable, define the same minimal local shape.
- Replace `Record<string, unknown>` on `emitKeypress` with `KeypressProperties`.
- Keep the `PromiseLike.then` rejection reason as `unknown`; this matches the promise contract and permits arbitrary rejection values.

Acceptance criteria:

- Both prompt helpers use the same semantic keypress shape.
- Existing prompt-driving tests compile and run without changes to emitted events.

## Phase 5: Retain intentional `unknown` boundaries

The following occurrences should remain and should not receive aliases that merely hide `unknown`:

### `create-vsts-npm-auth-improved`

- `src/cli.ts`: Commander error type-guard input.
- `src/init-auth/init-auth-command.ts`: caught-error formatting and Node error type-guard inputs.
- `src/init-auth/init-auth-failure.ts`: error causes and cause formatting.
- `src/init-auth/auth-setup/auth-setup-plan.ts`: adapter error/cause unwrapping input and result.
- `src/init-auth/auth-setup/npmrc-gitignore-check.ts`: error cause.
- `src/init-auth/package-files/package-json-discovery.ts`: filesystem failure cause.
- `tests/_test-utils/npm-project.ts`: Node error type-guard input.
- `tests/_test-utils/prompts-interaction.ts`: promise rejection reason.
- Dynamic package/config module values and all type-guard inputs until runtime validation succeeds.

### `vsts-npm-auth-improved`

- `src/cli.ts`: Commander error type-guard input.
- `src/auth/auth-command.ts`: caught-error formatting input.
- `tests/_test-utils/prompts-interaction.ts`: promise rejection reason.
- `tests/_test-utils/vitest-custom-matchers.ts`: matcher generic default.
- `tests/README.md`: documented Commander error type-guard example.

The string literal discriminator `"unknown"` in authentication results and tests is unrelated to the TypeScript `unknown` type and must remain unchanged.

## Phase 6: Tests and verification

1. Add or adjust focused tests only where a new type guard introduces runtime validation behavior.
2. Build and test the create package:

   ```powershell
   Set-Location projects/create-vsts-npm-auth-improved
   npm run build
   npm test
   ```

3. Build and test the authentication package:

   ```powershell
   Set-Location projects/vsts-npm-auth-improved
   npm run build
   npm test
   ```

4. Repeat the repository-wide audit:

   ```powershell
   rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/coverage/**' --glob '!**/test-reporters/**' --glob '!**/package-lock.json' '\bunknown\b|Record<string, unknown>' projects/create-vsts-npm-auth-improved projects/vsts-npm-auth-improved
   ```

5. Review every remaining match and confirm that it appears in the intentional-boundaries list or is a string literal/test description rather than a type.
6. Confirm `type-fest` is recorded as a direct development dependency in the create package's `package.json` and `package-lock.json` and is consumed only through type-only imports.
7. Confirm the diff contains no generated build, test-report, coverage, or installed dependency files.

## Commit and pull request

- Implement the refactor as one focused commit on a dedicated feature branch.
- Use a commit message describing semantic typing rather than claiming removal of all `unknown` values.
- Push the branch and open a draft pull request targeting `main`.
- Mention in the pull request description that the adapter and test-helper contracts now distinguish known domain data from untrusted runtime boundaries.

## Definition of done

- Both projects have been audited.
- General JSON and standard `package.json` field types are sourced from `type-fest`; focused validated/written adapter types remain local.
- All replaceable generic `unknown` maps have dedicated semantic types.
- Every remaining `unknown` is an intentional trust boundary, generic default, or promise rejection value.
- Both projects build and all tests pass.
- The changes are pushed to a draft PR without generated artifacts.
