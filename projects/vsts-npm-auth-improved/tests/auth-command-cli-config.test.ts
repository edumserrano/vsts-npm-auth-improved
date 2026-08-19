import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { execa } from "execa";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";

/**
 * Tests CLI configuration-path parsing and npm configuration validation.
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
 * Tests the --config-path option of the auth command and its -c alias.
 * Verifies that:
 * - vsts-npm-auth is called with the correct arguments
 * - The CLI command output reflects a successful token authentication.
 *
 * CLI commands:
 * - vsts-npm-auth-improved auth -c <path> --no-read --no-force
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test.each([{ useConfigPathAlias: true }, { useConfigPathAlias: false }])(
  "npm configuration path (useConfigPathAlias: $useConfigPathAlias)",
  async ({ useConfigPathAlias }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

    await AuthCommand.invokeAsync({
      type: "auth",
      configPath: {
        from: "cli",
        value: inMemoryNpmrcFile.path,
        useOptionAlias: useConfigPathAlias,
      },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
    expect(process.exitCode).toBe(0);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Tests authentication with multiple repeated configuration path options.
 * Verifies that path order is preserved.
 */
test("repeated configuration path options are forwarded in order", async () => {
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
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: [firstConfigPath, secondConfigPath],
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    `${firstConfigPath},${secondConfigPath}`,
  ]);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

/**
 * Tests the early failure scenario when the NPM configuration file does not exist.
 * Verifies that:
 * - The auth command fails before calling vsts-npm-auth
 * - The process exit code is 1
 * - The CLI output mentions the npm configuration file not being found
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path-that-does-not-exist> --no-read --no-force
 */
test("npm configuration file not found", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: "./this-dir-does-not-exist-in-memfs/.npmrc",
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

/**
 * Tests the early failure scenario when the NPM configuration file exists but has no registry defined.
 * Verifies that:
 * - The auth command fails before calling vsts-npm-auth
 * - The process exit code is 1
 * - The CLI output mentions that no registry entry was found
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test("npm configuration file without a registry defined", async () => {
  const npmConfigPath = "./this-dir-exists-only-in-memfs/.npmrc";
  vol.fromJSON({
    [npmConfigPath]: "",
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: npmConfigPath },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

/**
 * Tests validation of every supplied configuration file.
 * Verifies that one invalid file prevents authentication for the complete ordered set.
 */
test("every configuration file is validated before authentication starts", async () => {
  const validConfigPath = "./client/.npmrc";
  const invalidConfigPath = "./server/.npmrc";
  createInMemoryNpmrcFile({ vol, path: validConfigPath });
  createInMemoryNpmrcFile({ vol, path: invalidConfigPath, contents: "registry=   " });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: [validConfigPath, invalidConfigPath] },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).not.toHaveBeenCalled();
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

/**
 * Tests an npm configuration containing only a scoped registry.
 * Verifies that the missing global registry is rejected before authentication starts.
 */
test("a scoped registry without a global registry is rejected", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({
    vol,
    contents: "@example:registry=https://pkgs.dev.azure.com/org/_packaging/scoped/npm/registry/",
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests finding a global registry among unrelated npm settings.
 * Verifies that the registry is accepted and authentication proceeds successfully.
 */
test("a global registry amid unrelated npm settings is used", async () => {
  const registry = "https://pkgs.dev.azure.com/org/_packaging/global/npm/registry/";
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({
    vol,
    contents: [
      "always-auth=true",
      "fund=false",
      `registry=${registry}`,
      "save-exact=true",
      "@example:registry=https://pkgs.dev.azure.com/org/_packaging/scoped/npm/registry/",
    ].join("\n"),
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
