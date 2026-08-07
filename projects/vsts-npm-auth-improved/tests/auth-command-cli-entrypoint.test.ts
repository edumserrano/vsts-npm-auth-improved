import { afterAll, afterEach, expect, test, vi } from "vitest";
import { AuthCommand, VstsNpmAuthImprovedCli } from "@test-utils/auth-command";
import { execa } from "execa";
import { mockStderrWrite, mockStdoutWrite } from "@test-utils/process-output";

/**
 * Tests the top-level CLI entry point and informational auth command options.
 */

const { originalCiEnvironment } = vi.hoisted(() => {
  const originalCiEnvironment = process.env.CI;
  process.env.CI = "false";
  return { originalCiEnvironment };
});

vi.mock("execa");
vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

test.each([{ useOptionAlias: true }, { useOptionAlias: false }])(
  "auth command help text (useOptionAlias: $useOptionAlias)",
  async ({ useOptionAlias }) => {
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const execaFunctionMock = vi.mocked(execa);

    await AuthCommand.invokeAsync({
      type: "help",
      useOptionAlias,
    });

    expect(execaFunctionMock.mock.calls.length).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

test.each([{ useOptionAlias: true }, { useOptionAlias: false }])(
  "auth command version (useOptionAlias: $useOptionAlias)",
  async ({ useOptionAlias }) => {
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const execaFunctionMock = vi.mocked(execa);

    await AuthCommand.invokeAsync({
      type: "version",
      useOptionAlias,
    });

    expect(execaFunctionMock.mock.calls.length).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

test("an unknown Commander command is captured through cliAsync", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const stderrWriteFunctionMock = mockStderrWrite();
  const execaFunctionMock = vi.mocked(execa);

  await VstsNpmAuthImprovedCli.invokeAsync(["unknown-command"]);

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(stderrWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("a top-level terminal failure is handled", async () => {
  const execaFunctionMock = vi.mocked(execa);
  const unexpectedValue = "Unexpected top-level terminal failure";
  const consoleLog = vi.spyOn(console, "log").mockImplementationOnce(() => {
    throw unexpectedValue;
  });

  await VstsNpmAuthImprovedCli.invokeAsync(["auth"]);

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(consoleLog).toHaveBeenNthCalledWith(1);
  expect(consoleLog).toHaveBeenNthCalledWith(2, "🚨 Unexpected error:", unexpectedValue);
});

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
