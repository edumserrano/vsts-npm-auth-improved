# create-vsts-npm-auth-improved

`create-vsts-npm-auth-improved` is an interactive setup CLI for
`vsts-npm-auth-improved`. It configures one or more projects so their npm
registry settings and package scripts can use `vsts-npm-auth-improved`; it does
not authenticate with a registry itself.

## Requirements

- Node.js 24.18.1 or later
- npm with `npx`/`npm exec`

The setup CLI uses Node's cross-platform filesystem APIs and can be run on
Windows, macOS, or Linux. Authentication performed later by
`vsts-npm-auth-improved` has its own platform-specific behavior and requirements.

## Install and run

Install the CLI in a project:

```shell
npm install --save-dev create-vsts-npm-auth-improved
npx create-vsts-npm-auth-improved init-auth
```

The single `init-auth` command is also the default command, so this is
equivalent:

```shell
npx create-vsts-npm-auth-improved
```

It can also be run without first adding it to the project:

```shell
npx --yes create-vsts-npm-auth-improved init-auth
```

Use `--help` or `-h` for help and `--version` or `-v` for the package version:

```shell
npx create-vsts-npm-auth-improved --help
npx create-vsts-npm-auth-improved init-auth --help
npx create-vsts-npm-auth-improved --version
```

## Prompt flow

`init-auth` completes the interactive setup in this order:

1. Enter the root directory to search. The default is `./`, relative to the
   directory where the command was started. The directory must exist, be
   readable, and be a directory.
2. The CLI recursively discovers `package.json` files in deterministic order.
   It respects `.gitignore` files from the selected root up to the repository
   root as well as nested `.gitignore` files. It also skips hidden directories,
   symbolic-link directories, and directories named `node_modules`. Global Git
   ignore files are not applied, so discovery is consistent across machines.
3. Select `ALL` to configure every discovered package, or select a subset. An
   empty selection exits without changing files.
4. For each selected package whose adjacent `.npmrc` has no non-empty global
   `registry` setting, enter an absolute registry URL. Existing global registry
   values are reused, so those packages do not prompt. A scoped registry alone
   does not replace the required global registry.
5. After every selected package has been read, parsed, and planned—and all
   required registry prompts have completed—the CLI writes only changed files
   and reports created, updated, and unchanged counts.

Cancelling any prompt during planning exits before any file is written. Invalid
or unreadable input also stops planning before persistence begins.

## Resulting configuration

### `.npmrc`

For a new `.npmrc`, the CLI configures these managed settings:

```ini
registry=<registry entered in the prompt>
package-lock=true
lockfile-version=3
legacy-peer-deps=true
audit=false
fund=false
```

For an existing `.npmrc`, the CLI enforces those same six managed values. The
effective non-empty project `registry` value is reused; the other five managed
values are overwritten when they conflict. Credentials, unrelated settings,
and scoped registry entries such as `@scope:registry=...` remain configured.
Both global `always-auth=...` and scoped `//registry/:always-auth=...` settings
are removed.

### `package.json`

The CLI adds or replaces this exact development dependency:

```json
{
  "devDependencies": {
    "vsts-npm-auth-improved": "^1.0.0-alpha.1"
  }
}
```

It places these exact managed scripts at the top of the `scripts` object, in
this order:

```json
{
  "scripts": {
    "registry-auth": "vsts-npm-auth-improved -c ./.npmrc --read",
    "preinstall-packages": "npm run registry-auth",
    "install-packages": "npm i"
  }
}
```

Conflicting values for the managed dependency or scripts are overwritten.
Unrelated fields, dependencies, and scripts are preserved, with unrelated
scripts following the three managed entries. Repeating `init-auth` with the
same answers is idempotent: already-configured files remain unchanged.

### File serialization

The CLI uses npm's own `@npmcli/config` and `@npmcli/package-json` libraries to
parse and serialize `.npmrc` and `package.json` files. Managed semantic values
and unrelated semantic configuration are retained, but the original text is not
a preservation contract. Comments, formatting, duplicate entries, key ordering,
byte-order marks (BOMs), and newline style or final-newline choices are not
guaranteed after a semantic update. npm may also reorder dependency entries in
`package.json`.

Files whose managed configuration is already semantically correct are not
rewritten, so their existing bytes remain unchanged.

## Version policy

The `vsts-npm-auth-improved` range is part of this create package's generated
contract. Changing the managed range from `^1.0.0-alpha.1` requires a new release
of `create-vsts-npm-auth-improved`; do not silently change the range in an existing
release.

## Local development

From `vsts-npm-auth-improved/projects/create-vsts-npm-auth-improved`:

```shell
npm ci
npm run build
npm test
```

Additional test workflows:

```shell
npm run test:watch
npm run test:ui
npm run test:update-snapshots
```

`build` cleans `dist` before compiling the library and test TypeScript. `test`
cleans `test-reporters` before running Vitest with coverage. Generated build,
test-report, and tarball output is ignored by Git.

Build the release tarball with:

```shell
npm run pack
```

The package is written to:

```text
dist/create-vsts-npm-auth-improved-package/create-vsts-npm-auth-improved-1.0.0-alpha.1.tgz
```

Smoke-test that tarball with npm's package runner (PowerShell example):

```powershell
$tarball = (Resolve-Path .\dist\create-vsts-npm-auth-improved-package\create-vsts-npm-auth-improved-1.0.0-alpha.1.tgz).Path
npx --yes --package="$tarball" create-vsts-npm-auth-improved --help
npx --yes --package="$tarball" create-vsts-npm-auth-improved --version
```
