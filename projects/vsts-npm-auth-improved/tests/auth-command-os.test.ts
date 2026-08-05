import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { execa } from "execa";
import { vol } from "memfs";
import { AuthCommand } from "@test-utils/auth-command";
import { mockStdoutWrite } from "@test-utils/stdout";

/**
 * The tests below verify platform-specific auth command behavior outside Windows when all options
 * are provided via the CLI.
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

let mockedPlatform: NodeJS.Platform;

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});

beforeEach(() => {
  mockedPlatform = "darwin";
  vi.spyOn(process, "platform", "get").mockImplementation(() => mockedPlatform);
});

afterEach(() => {
  vi.resetAllMocks(); // clears history on module mocks like execa
  vi.restoreAllMocks(); // restores original implementations of spied functions
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Tests that automatic authentication is skipped on supported non-Windows Node.js platforms.
 * Verifies that:
 * - The manual-authentication warning is displayed without reading the NPM configuration file
 * - vsts-npm-auth is not called
 * - The process exit code is 0 so an npm script can continue
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --read --force
 */
test.each(["darwin", "linux"] as const)(
  "automatic authentication is skipped on %s",
  async platform => {
    mockedPlatform = platform;
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
      "Make sure you have manually configured authentication, or npm install will fail.",
    );
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);
