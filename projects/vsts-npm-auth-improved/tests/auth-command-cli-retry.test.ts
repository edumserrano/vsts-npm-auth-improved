import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";

/**
 * Tests forced-acquisition retry behavior after authentication failures.
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

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Tests the automatic retry scenario when vsts-npm-auth returns could-not-get-auth-token.
 * Verifies that:
 * - The retry calls vsts-npm-auth with force token acquisition (-F flag)
 * - The process exit code is 0 after successful retry
 * - The CLI output reflects the retry behavior
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test("retries once with force token acquisition when vsts-npm-auth returns could-not-get-auth-token", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth(["could-not-get-auth-token", "credentials-obtained"]);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    { lines: true, all: true, reject: false },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
      "-F",
    ],
    { lines: true, all: true, reject: false },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

/**
 * Tests mixed output containing both existing credentials and a registry authentication failure.
 * Verifies that the failure takes precedence and triggers one forced retry.
 */
test("a failed registry takes precedence over existing credentials and is retried", async () => {
  const firstConfigPath = "./client/.npmrc";
  const secondConfigPath = "./server/.npmrc";
  createInMemoryNpmrcFile({
    vol,
    path: firstConfigPath,
    contents: "registry=https://pkgs.dev.azure.com/org/_packaging/client/npm/registry/",
  });
  createInMemoryNpmrcFile({
    vol,
    path: secondConfigPath,
    contents: "registry=https://pkgs.dev.azure.com/org/_packaging/server/npm/registry/",
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth([
    "mixed-existing-credentials-and-auth-failure",
    "credentials-obtained",
  ]);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: `${firstConfigPath},${secondConfigPath}` },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      `${firstConfigPath},${secondConfigPath}`,
    ],
    { lines: true, all: true, reject: false },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      `${firstConfigPath},${secondConfigPath}`,
      "-F",
    ],
    { lines: true, all: true, reject: false },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

/**
 * Tests that the automatic retry with force token acquisition preserves the original CLI arguments.
 * Verifies that:
 * - The retry includes the -F flag while keeping other arguments like -R (read-only scope)
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --read --no-force
 */
test("retry with force token acquisition keeps arguments", async () => {
  const firstConfigPath = "./client/.npmrc";
  const secondConfigPath = "./server/.npmrc";
  createInMemoryNpmrcFile({ vol, path: firstConfigPath });
  createInMemoryNpmrcFile({ vol, path: secondConfigPath });
  const targetConfig = "./credentials/.npmrc";
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth(["could-not-get-auth-token", "credentials-obtained"]);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: `${firstConfigPath},${secondConfigPath}` },
    targetConfig: { from: "cli", value: targetConfig },
    expirationMinutes: { from: "cli", value: 120 },
    read: { from: "cli", value: true },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      `${firstConfigPath},${secondConfigPath}`,
      "-T",
      targetConfig,
      "-E",
      "120",
      "-R",
    ],
    { lines: true, all: true, reject: false },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      `${firstConfigPath},${secondConfigPath}`,
      "-T",
      targetConfig,
      "-E",
      "120",
      "-R",
      "-F",
    ],
    { lines: true, all: true, reject: false },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

/**
 * Tests the failure scenario when the automatic retry also fails.
 * Verifies that:
 * - When vsts-npm-auth returns could-not-get-auth-token twice (initial attempt and retry),
 *   the process exit code is 1
 * - The CLI output reflects the result of the final failed attempt
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test("retries once but still fails", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth(["could-not-get-auth-token", "could-not-get-auth-token"]);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    { lines: true, all: true, reject: false },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2,
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
      "-F",
    ],
    { lines: true, all: true, reject: false },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

/**
 * Tests a failed authentication request that was already forced.
 * Verifies that the command does not repeat an explicitly forced request.
 */
test("an initial forced authentication failure does not retry", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("could-not-get-auth-token");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    read: { from: "cli", value: false },
    force: { from: "cli", value: true },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-F"]);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
