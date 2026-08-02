import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { execa } from "execa";
import { vol } from "memfs";
import { AuthCommand } from "@test-utils/auth-command";
import { mockStdoutWrite } from "@test-utils/stdout";

/**
 * The tests below verify CI-specific auth command behavior when all options are provided via the
 * CLI.
 */

vi.mock("execa");
vi.mock("ci-info", () => ({ isCI: true }));
vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});

let mockedPlatform: NodeJS.Platform;

beforeEach(() => {
  mockedPlatform = "win32";
  vi.spyOn(process, "platform", "get").mockImplementation(() => mockedPlatform);
});

afterEach(() => {
  vi.resetAllMocks(); // clears history on module mocks like execa
  vi.restoreAllMocks(); // restores original implementations of spied functions
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Tests that automatic authentication is skipped in CI when every auth option is supplied.
 * Verifies that:
 * - The CI authentication warning is displayed without reading the NPM configuration file
 * - vsts-npm-auth is not called
 * - The process exit code is 0 so an npm script can continue
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
 * Tests that CI detection takes precedence over the non-Windows platform check.
 * Verifies that the CI-specific warning is displayed instead of the non-Windows warning.
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
