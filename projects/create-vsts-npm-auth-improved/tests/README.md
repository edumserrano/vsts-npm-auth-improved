# Testing Strategy

- [Mocking ES Modules with vi.mock](#mocking-es-modules-with-vimock)
- [npm-owned Serialization Contracts](#npm-owned-serialization-contracts)
- [Public CLI Testing with Commander](#public-cli-testing-with-commander)
  - [The process.exit challenge](#the-processexit-challenge)
  - [Solution: Using program.exitOverride()](#solution-using-programexitoverride)

## Mocking ES Modules with vi.mock

Vitest moves `vi.mock` calls to the top of the file. It always runs them before all imports. Thus, the tests can mock ES modules.

From the Vitest docs:

> When Vitest sees that a file has `vi.mock` inside, it will transform every static import into a dynamic one and move the `vi.mock` call to the top of the file. This allows Vitest to register the mock before the import happens without breaking the ESM rule of hoisted imports.

See:

- [Mocking Modules: How It Works](https://vitest.dev/guide/mocking/modules.html#how-it-works)
- [Mock an Exported Function](https://vitest.dev/guide/mocking.html#mock-an-exported-function)

## npm-owned Serialization Contracts

CLI workflow tests use real temporary directories. Through the public command, they verify the semantic configuration from `@npmcli/config` and `@npmcli/package-json`. The tests compare parsed configuration. They compare file content only when they must prove that the command does not rewrite an unchanged file. The tests add repeatable read and write failures at external-library or test-owned file-system boundaries.

The test contract does not guarantee these `.npmrc` details:

- Comments or inline comments.
- Blank or malformed lines.
- Exact key order.
- CRLF or LF line endings.
- Byte order marks (BOMs).
- A final newline.

For `package.json`, the contract also does not guarantee BOMs, final newlines, or compact formatting. It does not guarantee a dependency order that is different from the npm sort order. npm can normalize these details when it saves a semantic update. The tests continue to verify unrelated semantic configuration.

## Public CLI Testing with Commander

All tests in this folder call the imported `cliAsync` function in the test process. This validates the public CLI boundary. Normal operations use isolated temporary directories on the host file system.

Application modules below `src` are implementation details. Tests must not import, dynamically load, mock, or verify calls to them. Production libraries such as Commander, Globby, and the npm configuration packages must stay real. Tests can replace external interactions at their system boundary. Examples are terminal streams and specified Node file-system operations that a temporary fixture cannot make fail on all platforms.

The `test:boundaries` check enforces the application-code boundary and the production-dependency restriction.

The emitted-package integration test is the only exception. It builds and loads the compiled public API. The suite does not do these tasks:

- Run the emitted npm binary.
- Run a real authentication process.
- Contact an Azure registry.

- **CLI interface tests**: The tests use all commands, options, and aliases in the same way as users.
- **CLI error tests**: The tests make sure that the CLI and Commander process errors correctly.
- **Stable tests**: The tests stay stable after internal implementation changes if the public CLI interface does not change.

### The process.exit challenge

By default, Commander calls `process.exit` when it detects errors through `Command.error`. It also calls `process.exit` after it shows help or version information.

These unexpected calls to `process.exit` would stop the tests.

### Solution: Using program.exitOverride()

Use `program.exitOverride()` to prevent Commander from calling `process.exit`. Refer to [Override exit and output handling](https://www.npmjs.com/package/commander#override-exit-and-output-handling) in the Commander documentation.

With `exitOverride()` enabled, Commander throws a `CommanderError` instead of calling `process.exit`. The catch block follows the `program.parseAsync` call in `cliAsync`. This block identifies a `CommanderError` and sets the applicable exit code:

```typescript
// This code is from /projects/create-vsts-npm-auth-improved/src/cli.ts.
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

Known `init-auth` failures do not reach this catch block. Directory searches, file reads, invalid `package.json` content, and file writes return typed operation results. The command error boundary processes unexpected failures in `handleInitAuthCommandAsync`. This behavior agrees with the auth project. Only failures outside the command handler use the outer `Unexpected error` fallback.

With this method, the CLI does not call `process.exit`. The tests can verify the exit code while the process continues:

```typescript
expect(process.exitCode).toBe(1);
```
