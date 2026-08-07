# Testing Strategy

- [Mocking ES Modules with vi.mock](#mocking-es-modules-with-vimock)
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

## Public CLI Testing with Commander

The tests in this folder call the imported `cliAsync` function in the test process. This validates the public CLI boundary. A mock of Execa replaces the external `npx` process for [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). memfs replaces `node:fs` at the file-system boundary. The tests can also control the environment and platform state.

These tests examine the full source layer. They do not examine these items:

- The emitted executable.
- The host file system.
- The real authentication process.
- An Azure registry.

Application modules below `src` are implementation details. Tests must not import, dynamically load, mock, or verify calls to them. Production libraries must also stay real unless they implement an approved external boundary. Execa is the specified process-boundary exception. Commander and CI detection stay real. The `test:boundaries` check enforces these restrictions and the single `cliAsync` import.

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

function isCommanderError(error: unknown): error is CommanderError {
  return error instanceof CommanderError;
}
```

With this method, the CLI does not call `process.exit`. Commander errors set `process.exitCode` to their effective exit code. Unexpected errors set it to `1` and show an error message. The tests can verify the exit code while the process continues:

```typescript
expect(process.exitCode).toBe(1);
```
