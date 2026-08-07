import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { execa } from "execa";
import { vol } from "memfs";
import { AuthCommand } from "@test-utils/auth-command";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * These tests verify the auth command behavior in CI when the CLI supplies all options.
 */

const { originalCiEnvironment } = vi.hoisted(() => {
  const originalCiEnvironment = process.env.CI;
  process.env.CI = "true";
  return { originalCiEnvironment };
});

vi.mock("execa");
vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});

let mockedPlatform: NodeJS.Platform;

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});

beforeEach(() => {
  mockedPlatform = "win32";
  vi.spyOn(process, "platform", "get").mockImplementation(() => mockedPlatform);
});

afterEach(() => {
  vi.resetAllMocks(); // Clear the call history of module mocks such as Execa.
  vi.restoreAllMocks(); // Restore the original implementations of spied functions.
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Verifies that the command does not start automatic authentication in CI.
 * Expected results:
 * - The command shows the CI authentication warning.
 * - The command does not read the npm configuration file.
 * - The command does not call vsts-npm-auth.
 * - The process exit code is 0, and the npm script can continue.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --read --force
 */
test("automatic authentication is skipped in CI", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: "./missing/.npmrc" },
    read: { from: "cli", value: true },
    force: { from: "cli", value: true },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toContain(
    "Make sure you have configured authentication in your CI environment, or npm install will fail.",
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies that CI detection occurs before the non-Windows platform check.
 * The command must show the CI warning, not the non-Windows warning.
 */
test("CI detection takes precedence over the non-Windows platform check", async () => {
  mockedPlatform = "darwin";
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: "./missing/.npmrc" },
    read: { from: "cli", value: true },
    force: { from: "cli", value: true },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toContain(
    "Automatic NPM registry authentication is not supported in CI environments.",
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).not.toContain(
    "Automatic NPM registry authentication is only supported on Windows.",
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});
