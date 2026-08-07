# Testing Strategy

- [Mocking ES Modules with vi.mock](#mocking-es-modules-with-vimock)
- [npm-owned Serialization Contracts](#npm-owned-serialization-contracts)
- [Public CLI Testing with Commander](#public-cli-testing-with-commander)
  - [The process.exit challenge](#the-processexit-challenge)
  - [Solution: Using program.exitOverride()](#solution-using-programexitoverride)

## Mocking ES Modules with vi.mock

`vi.mock` calls are hoisted to the top of the file. They will always be executed before all imports. That's what allows us to mock ES modules.

From the Vitest docs:

> When Vitest sees that a file has `vi.mock` inside, it will transform every static import into a dynamic one and move the `vi.mock` call to the top of the file. This allows Vitest to register the mock before the import happens without breaking the ESM rule of hoisted imports.

See:

- [Mocking Modules: How It Works](https://vitest.dev/guide/mocking/modules.html#how-it-works)
- [Mock an Exported Function](https://vitest.dev/guide/mocking.html#mock-an-exported-function)

## npm-owned Serialization Contracts

CLI workflow tests use an isolated in-memory filesystem and assert the semantic
configuration produced by `@npmcli/config` and `@npmcli/package-json` through
the public command. Tests compare parsed configuration except when proving that
an unchanged file is not rewritten. Deterministic read and write failures are
injected at external library or test-owned filesystem boundaries. The emitted
package integration test still writes compiler output to `dist`, but its CLI
scenario uses the same in-memory project filesystem as the source tests.

The test contract deliberately does not guarantee `.npmrc` comments or inline
comments, blank or malformed lines, exact key order, CRLF versus LF, BOMs, or
final-newline choices. For `package.json`, BOMs, final newlines, compact
formatting, and dependency order contrary to npm's sorting behavior are also not
guaranteed. npm may normalize any of these details when a semantic update is
saved; unrelated semantic configuration remains covered.

## Public CLI Testing with Commander

All the tests in this folder invoke the imported `cliAsync` function in-process
to validate the public CLI boundary. Normal operations use isolated in-memory
project directories. Application modules beneath `src` are
implementation details: tests must not import, dynamically load, mock, or assert
calls to them. Production libraries such as Commander, Globby, and the npm
configuration packages are also implementation choices and must remain real.
Tests may replace external interactions at their system boundary, such as
terminal streams, the Node filesystem, or targeted filesystem operations.

The `test:boundaries` check enforces both the application-code boundary and the
production-dependency restriction.

The only exception to the above is the emitted-package integration test which builds and loads the compiled public API. The suite does not execute the emitted npm binary, run a real authentication process, or contact an Azure registry. This approach provides several benefits:

- **Testing the CLI interface**: All commands, options, and aliases are tested as users would interact with them.
- **Testing CLI error handling**: Ensures error scenarios are handled correctly at the CLI level, including Commander's error handling.
- **Minimizes breaking tests**: Tests remain stable when internal implementation changes, as long as the public CLI interface stays consistent.

### The process.exit challenge

When unit testing with Commander, there's an important challenge: by default, Commander calls `process.exit` when it detects errors (via `Command.error`), or after displaying help or version information.

This would cause tests to abort due to unexpected calls to `process.exit`.

### Solution: Using program.exitOverride()

To prevent Commander from calling `process.exit`, we use `program.exitOverride()`. See the [Override exit and output handling](https://www.npmjs.com/package/commander#override-exit-and-output-handling) section in Commander's documentation.

With `exitOverride()` enabled, Commander throws a `CommanderError` instead of calling `process.exit`. In the catch block after calling `program.parseAsync` in the `cliAsync` function, we check if it's a `CommanderError` and set the exit code accordingly:

```typescript
// code from /projects/create-vsts-npm-auth-improved/src/cli.ts
try {
  console.log();
  const program = createProgram();
  await program.parseAsync(argv);
} catch (error) {
  if (isCommanderError(error)) {
    process.exitCode = error.exitCode;
    return;
  }

  console.log("🚨 Unexpected error:", error);
  process.exitCode = 1;
  return;
}
```

Known `init-auth` failures do not reach this catch. Directory searches, file reads, invalid package.json content, and file writes return typed operation-based outcomes. Unexpected failures inside `handleInitAuthCommandAsync` are handled by the command's own error boundary, consistently with the auth project. Only failures outside the command handler use the outer `Unexpected error` fallback.

With this approach, the CLI does not call `process.exit`. The tests can verify the exit code without the process actually exiting:

```typescript
expect(process.exitCode).toBe(1);
```
