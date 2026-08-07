# Testing Strategy

- [Mocking ES Modules with vi.mock](#mocking-es-modules-with-vimock)
- [Public CLI Testing with Commander](#public-cli-testing-with-commander)
  - [The process.exit challenge](#the-processexit-challenge)
  - [Solution: Using program.exitOverride()](#solution-using-programexitoverride)
- [Test Suite Organization](#test-suite-organization)

## Mocking ES Modules with vi.mock

`vi.mock` calls are hoisted to the top of the file. They will always be executed before all imports. That's what allows us to mock ES modules.

From the Vitest docs:

> When Vitest sees that a file has `vi.mock` inside, it will transform every static import into a dynamic one and move the `vi.mock` call to the top of the file. This allows Vitest to register the mock before the import happens without breaking the ESM rule of hoisted imports.

See:

- [Mocking Modules: How It Works](https://vitest.dev/guide/mocking/modules.html#how-it-works)
- [Mock an Exported Function](https://vitest.dev/guide/mocking.html#mock-an-exported-function)

## Public CLI Testing with Commander

The tests in this folder invoke the imported `cliAsync` function in-process to validate the public CLI boundary. Execa is mocked as the boundary to the external `npx` process for [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and `node:fs` is replaced by memfs as the filesystem boundary. Environment and platform state may also be controlled directly. These are full-layer source tests rather than tests of the emitted executable, host filesystem, real authentication process, or Azure registry. This approach provides several benefits:

Application modules beneath `src` are implementation details: tests must not import, dynamically load, mock, or assert calls to them. Production libraries are implementation choices and must also remain real unless they implement an approved external boundary. Execa is the explicit process-boundary exception; Commander and CI detection remain real. The `test:boundaries` check enforces these restrictions as well as the single `cliAsync` import.

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

With this approach, the CLI does not call `process.exit`. Commander errors set `process.exitCode` to their effective exit code, while unexpected errors are reported and set it to `1`. The tests can verify the exit code without the process actually exiting:

```typescript
expect(process.exitCode).toBe(1);
```

## Test Suite Organization

The main auth command tests are grouped by behavior so each file has a focused responsibility:

- `auth-command-cli-entrypoint.test.ts`: help, version, and top-level CLI behavior.
- `auth-command-cli-config.test.ts`: configuration-path parsing and npm configuration validation.
- `auth-command-cli-options.test.ts`: authentication options supplied through the CLI.
- `auth-command-cli-results.test.ts`: authentication results, output, and unexpected failures.
- `auth-command-cli-retry.test.ts`: forced-acquisition retry behavior.
- `auth-command-prompts-flow.test.ts`: successful default and non-default prompt flows.
- `auth-command-prompts-validation.test.ts`: prompt validation and correction flows.
- `auth-command-prompts-cancellation.test.ts`: cancellation at each prompt stage.

CI- and operating-system-specific behavior remains in the corresponding `-ci` and `-os` suites.
