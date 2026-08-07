import { test, expect, afterAll, afterEach, beforeEach, vi } from "vitest";
import { AuthCommand, VstsNpmAuthImprovedCli } from "@test-utils/auth-command";
import { execa } from "execa";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStderrWrite, mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth, MockVstsNpmAuthOptions } from "@test-utils/vsts-npm-auth";

/**
 * These tests verify the auth command when the CLI supplies all options.
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
  vi.resetAllMocks(); // Clear the call history of module mocks such as Execa.
  vi.restoreAllMocks(); // Restore the original implementations of spied functions.
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Verifies the --help and -h options.
 * Expected results:
 * - The command shows the help text.
 * - The command does not call vsts-npm-auth.
 * - The process exit code is 0.
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
 * Verifies the --version and -v options.
 * Expected results:
 * - The command shows the version.
 * - The command does not call vsts-npm-auth.
 * - The process exit code is 0.
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
 * Verifies the --config-path option and its -c alias.
 * Expected results:
 * - The command calls vsts-npm-auth with the correct arguments.
 * - The CLI output shows successful token authentication.
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
 * Verifies the --read and --no-read options.
 * Expected results:
 * - The command calls vsts-npm-auth with the correct arguments.
 * - The CLI output shows the token scope.
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
 * Verifies the --force and --no-force options.
 * Expected results:
 * - The command calls vsts-npm-auth with the correct arguments.
 * - The CLI output shows the force option.
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
 * Verifies successful results from the vsts-npm-auth package.
 * Expected results:
 * - The process exit code is 0.
 * - The CLI output shows if the command got new credentials or used existing credentials.
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
 * Verifies vsts-npm-auth failures that do not start an automatic retry.
 * Expected results:
 * - The process exit code is 1.
 * - The CLI output shows the applicable error.
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
 * Verifies the automatic retry after a could-not-get-auth-token result.
 * Expected results:
 * - The retry calls vsts-npm-auth with the -F option.
 * - The process exit code is 0 after a successful retry.
 * - The CLI output shows the retry.
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
    1, // The first call fails.
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
    2, // The second call uses force and succeeds.
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
 * Verifies that the forced retry keeps the original CLI arguments.
 * Expected result:
 * - The retry adds -F and keeps other arguments such as -R.
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
    1, // The first call fails.
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
    2, // The second call uses force and succeeds.
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
 * Verifies a failure of the automatic retry.
 * Expected results:
 * - vsts-npm-auth returns could-not-get-auth-token for the first call and the retry.
 * - The process exit code is 1.
 * - The CLI output shows the result of the final failed call.
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
 * Verifies an early failure when the npm configuration file does not exist.
 * Expected results:
 * - The auth command fails before it calls vsts-npm-auth.
 * - The process exit code is 1.
 * - The CLI output shows that the command did not find the npm configuration file.
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
 * Verifies an early failure when the npm configuration file has no registry.
 * Expected results:
 * - The auth command fails before it calls vsts-npm-auth.
 * - The process exit code is 1.
 * - The CLI output shows that the command did not find a registry entry.
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
 * Verifies the processing of an unexpected auth command error.
 * The Execa mock throws an error during the vsts-npm-auth call.
 * Expected results:
 * - The process exit code is 1.
 * - The CLI output shows the error message.
 */
test("unexpected errors are handled", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  // Make the Execa mock throw an error to simulate an unexpected failure.
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
  expect(consoleLog).toHaveBeenNthCalledWith(
    2,
    "🚨 Unexpected error:",
    unexpectedValue,
  );
});

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
