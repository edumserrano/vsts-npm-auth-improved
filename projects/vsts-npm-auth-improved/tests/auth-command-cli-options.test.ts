import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { execa } from "execa";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStderrWrite, mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";

/**
 * Tests auth options supplied through the CLI.
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
 * Tests the target configuration and expiration options through their long and short forms.
 * Verifies that both forms map to the corresponding vsts-npm-auth arguments.
 */
test.each([{ useOptionAlias: true }, { useOptionAlias: false }])(
  "target and expiration auth options (useOptionAlias: $useOptionAlias)",
  async ({ useOptionAlias }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
    const targetConfig = "./credentials/.npmrc";
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

    await AuthCommand.invokeAsync({
      type: "auth",
      configPath: { from: "cli", value: inMemoryNpmrcFile.path },
      targetConfig: { from: "cli", value: targetConfig, useOptionAlias },
      expirationMinutes: { from: "cli", value: 60, useOptionAlias },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
      "-C",
      inMemoryNpmrcFile.path,
      "-T",
      targetConfig,
      "-E",
      "60",
    ]);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
    expect(process.exitCode).toBe(0);
  },
);

/**
 * Tests the maximum supported token expiration lifetime.
 * Verifies that the boundary value is forwarded to vsts-npm-auth.
 */
test("the maximum expiration lifetime is forwarded", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  // This is not needed to assert or control mock behavior; it only suppresses CLI output in the test runner.
  mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
    expirationMinutes: { from: "cli", value: 525_600 },
    read: { from: "cli", value: false },
    force: { from: "cli", value: false },
  });

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-E",
    "525600",
  ]);
  expect(process.exitCode).toBe(0);
});

/**
 * Tests invalid token expiration values.
 * Verifies that malformed and out-of-range values fail before authentication starts.
 */
test.each(["0", "-1", "1.5", "abc", "Infinity", "525601", "9007199254740992"])(
  "invalid expiration minutes are rejected: %s",
  async expirationMinutes => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
    const stderrWriteFunctionMock = mockStderrWrite();
    const execaFunctionMock = vi.mocked(execa);

    await AuthCommand.invokeAsync({
      type: "auth",
      configPath: { from: "cli", value: inMemoryNpmrcFile.path },
      expirationMinutes: { from: "cli", value: expirationMinutes },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(execaFunctionMock).not.toHaveBeenCalled();
    expect(stderrWriteFunctionMock.normalizedOutput).toMatchSnapshot();
    expect(process.exitCode).toBe(1);
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
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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
 * Tests using read-only scope and forced acquisition together.
 * Verifies that both flags are forwarded to vsts-npm-auth.
 */
test("combined read and force options are passed to vsts-npm-auth", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
