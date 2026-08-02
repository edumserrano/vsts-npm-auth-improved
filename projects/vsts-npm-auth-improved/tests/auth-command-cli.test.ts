import { test, expect, afterEach, beforeEach, vi } from "vitest";
import { AuthCommand, VstsNpmAuthImprovedCli } from "@test-utils/auth-command";
import { execa } from "execa";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/stdout";
import { mockVstsNpmAuth, MockVstsNpmAuthOptions } from "@test-utils/vsts-npm-auth";
import { Command } from "commander";

/**
 * The tests below will test the auth command when all the options are provided via the CLI.
 */

vi.mock("execa");
vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
});

afterEach(() => {
  vi.resetAllMocks(); // clears history on module mocks like execa
  vi.restoreAllMocks(); // restores original implementations of spied functions
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Tests that the auth command displays help text when using --help or -h options.
 * Verifies that:
 * - vsts-npm-auth is not called
 * - The process exit code is 0
 *
 * CLI commands:
 * - vsts-npm-auth-improved auth --help
 * - vsts-npm-auth-improved auth -h
 */
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

/**
 * Tests that the auth command displays version when using --version or -v options.
 * Verifies that:
 * - vsts-npm-auth is not called
 * - The process exit code is 0
 *
 * CLI commands:
 * - vsts-npm-auth-improved auth --version
 * - vsts-npm-auth-improved auth -v
 */
test.each([{ useOptionAlias: true }, { useOptionAlias: false }])(
  "auth command version (useOptionAlias: $useOptionAlias)",
  async ({ useOptionAlias }) => {
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const execaFunctionMock = vi.mocked(execa);

    await AuthCommand.invokeAsync({
      type: "version",
      useOptionAlias: useOptionAlias,
    });

    expect(execaFunctionMock.mock.calls.length).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

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
 * Tests the --read and --no-read options of the auth command.
 * Verifies that:
 * - vsts-npm-auth is called with the correct arguments
 * - The CLI command output reflects the token scope
 *
 * CLI commands:
 * - vsts-npm-auth-improved auth -c <path> --read --no-force
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test.each([
  { read: false, expectedVstsNpmAuthArgs: [] },
  { read: true, expectedVstsNpmAuthArgs: ["-R"] },
])("token scope (read: $read)", async ({ read, expectedVstsNpmAuthArgs }) => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: read },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    ...expectedVstsNpmAuthArgs,
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests the --force and --no-force options of the auth command.
 * Verifies that:
 * - vsts-npm-auth is called with the correct arguments
 * - The CLI command output reflects the forced token acquisition option
 *
 * CLI commands:
 * - vsts-npm-auth-improved auth -c <path> --force
 * - vsts-npm-auth-improved auth --config-path <path> --no-force
 */
test.each([
  { force: false, expectedVstsNpmAuthArgs: [] },
  { force: true, expectedVstsNpmAuthArgs: ["-F"] },
])("token acquisition (force: $force)", async ({ force, expectedVstsNpmAuthArgs }) => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: force },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    ...expectedVstsNpmAuthArgs,
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests the possible success scenarios for results from the vsts-npm-auth package.
 * Verifies that:
 * - The process exit code is 0
 * - The CLI output reflects what was done in regards to the authentication process
 *   (e.g., obtaining new credentials, already having credentials, etc)
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test.each<{ vstsNpmAuthResult: MockVstsNpmAuthOptions }>([
  { vstsNpmAuthResult: "credentials-obtained" },
  { vstsNpmAuthResult: "already-have-credentials" },
])(
  "auth success cases (vsts-npm-auth returns $vstsNpmAuthResult)",
  async ({ vstsNpmAuthResult }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth(vstsNpmAuthResult);

    await AuthCommand.invokeAsync({
      type: "auth",
      configPath: {
        from: "cli",
        value: inMemoryNpmrcFile.path,
      },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
      "-C",
      inMemoryNpmrcFile.path,
    ]);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
    expect(process.exitCode).toBe(0);
  },
);

/**
 * Tests failure scenarios for results from the vsts-npm-auth package where there isn't an automatic retry.
 * Verifies that:
 * - The process exit code is 1
 * - The CLI output reflects the error (e.g., config file not found, credentials not required, etc)
 *
 * CLI command:
 * - vsts-npm-auth-improved auth --config-path <path> --no-read --no-force
 */
test.each<{ vstsNpmAuthResult: MockVstsNpmAuthOptions }>([
  { vstsNpmAuthResult: "config-file-not-found" },
  { vstsNpmAuthResult: "credentials-not-required" },
  { vstsNpmAuthResult: "no-registry-entry-found" },
  { vstsNpmAuthResult: "unknown" },
])(
  "auth failures cases (vsts-npm-auth returns $vstsNpmAuthResult)",
  async ({ vstsNpmAuthResult }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth(vstsNpmAuthResult);

    await AuthCommand.invokeAsync({
      type: "auth",
      configPath: {
        from: "cli",
        value: inMemoryNpmrcFile.path,
      },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
      "-C",
      inMemoryNpmrcFile.path,
    ]);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
    expect(process.exitCode).toBe(1);
  },
);

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
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1, // first call, failed attempt
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2, // second call, retry with force and succeeded
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
      "-F",
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
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
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth(["could-not-get-auth-token", "credentials-obtained"]);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: true },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(2);
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    1, // first call, failed attempt
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
      "-R",
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(vstsNpmAuthMock).toHaveBeenNthCalledWith(
    2, // second call, retry with force and succeeded
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
      "-R",
      "-F",
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
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
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
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
    {
      lines: true,
      all: true,
      reject: false,
    },
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
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
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
  const npmrcContents = "";
  vol.fromJSON({
    [npmConfigPath]: npmrcContents,
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: npmConfigPath,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

/**
 * Tests the error handling when executing the auth command.
 * Verifies that:
 * - When an unexpected error is thrown during the auth command execution,
 *   the process exit code is 1
 * - The CLI output shows the error message
 *
 * This test simulates a failure when calling vsts-npm-auth by mocking execa to throw an error.
 */
test("unexpected errors are handled", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  // Mock execa to throw an error to simulate an unexpected failure
  execaFunctionMock.mockRejectedValueOnce(new Error("Unexpected test error"));

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(1);
  expect(execaFunctionMock).toHaveBeenCalledWith(
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(1);
});

test("an initial forced authentication failure does not retry", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("could-not-get-auth-token");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: true },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-F",
  ]);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("combined read and force options are passed to vsts-npm-auth", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: true },
    force: { from: "cli", value: true },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-R",
    "-F",
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("multiple unknown vsts-npm-auth output lines are displayed in order", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  execaFunctionMock.mockResolvedValueOnce({
    all: [
      "",
      "vsts-npm-auth v0.43.0.0 ",
      "-----------------------",
      "First unknown output line",
      "Second unknown output line",
      "Third unknown output line",
    ],
  } as any);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(1);
  expect(execaFunctionMock.mock.calls.slice(1)).toHaveLength(0);
  expect(execaFunctionMock).toHaveBeenCalledWith(
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("an unexpected Error reports its Error cause", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  execaFunctionMock.mockRejectedValueOnce(
    new Error("Outer test error", {
      cause: new Error("Inner test cause"),
    }),
  );

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(1);
  expect(execaFunctionMock.mock.calls.slice(1)).toHaveLength(0);
  expect(execaFunctionMock).toHaveBeenCalledWith(
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("an unexpected non-Error rejection is handled", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  execaFunctionMock.mockRejectedValueOnce("Unexpected non-Error rejection");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(1);
  expect(execaFunctionMock.mock.calls.slice(1)).toHaveLength(0);
  expect(execaFunctionMock).toHaveBeenCalledWith(
    "npx",
    [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "vsts-npm-auth@latest",
      "-C",
      inMemoryNpmrcFile.path,
    ],
    {
      lines: true,
      all: true,
      reject: false,
    },
  );
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("a scoped registry without a global registry is rejected", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({
    vol,
    contents:
      "@example:registry=https://pkgs.dev.azure.com/org/_packaging/scoped/npm/registry/",
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

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
    configPath: {
      from: "cli",
      value: inMemoryNpmrcFile.path,
    },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("an unknown Commander command is captured through cliAsync", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const stderrWriteFunctionMock = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  const execaFunctionMock = vi.mocked(execa);

  await VstsNpmAuthImprovedCli.invokeAsync(["unknown-command"]);

  const normalizedStderr = stderrWriteFunctionMock.mock.calls
    .map(args => args[0])
    .filter((output): output is string => typeof output === "string")
    .map(output => output.replace(/\x1B\[[^m]*[a-zA-Z]|\x1B\].*?\x07/g, ""))
    .flatMap(output => output.split(/\r?\n/))
    .filter(output => output.trim() !== "")
    .join("\n");

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(normalizedStderr).toMatchSnapshot();
});

test("a top-level non-Commander CLI failure is handled", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const unexpectedValue = "Unexpected top-level non-Commander failure";
  vi.spyOn(Command.prototype, "parseAsync").mockRejectedValueOnce(
    unexpectedValue,
  );

  await VstsNpmAuthImprovedCli.invokeAsync(["auth"]);

  expect(execaFunctionMock).toHaveBeenCalledTimes(0);
  expect(execaFunctionMock.mock.calls.length).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(consoleLog).toHaveBeenNthCalledWith(1);
  expect(consoleLog).toHaveBeenNthCalledWith(
    2,
    "🚨 Unexpected error:",
    unexpectedValue,
  );
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});
