import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { vol } from "memfs";
import { AuthCommand } from "@test-utils/auth-command";
import { mockStdoutWrite } from "@test-utils/stdout";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";

/**
 * The tests below verify platform-specific auth command behavior outside Windows when options are
 * provided via user prompts.
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

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
});

afterEach(() => {
  vi.resetAllMocks(); // clears history on module mocks like execa
  vi.restoreAllMocks(); // restores original implementations of spied functions
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Tests the non-Windows flow when every auth option would normally be provided via prompts.
 * Verifies that:
 * - NPM configuration path, token scope, and forced-acquisition prompts are all skipped
 * - The manual-authentication warning is displayed without a registry URL
 * - vsts-npm-auth is not called and the process exit code is 0
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
test("non-Windows flow skips all auth option prompts", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toContain(
    "Make sure you have manually configured authentication, or npm install will fail.",
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});
