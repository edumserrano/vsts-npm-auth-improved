import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { execa } from "execa";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth, MockVstsNpmAuthOptions } from "@test-utils/vsts-npm-auth";

/**
 * Tests authentication results, output handling, and unexpected process failures.
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
      configPath: { from: "cli", value: inMemoryNpmrcFile.path },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
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
      configPath: { from: "cli", value: inMemoryNpmrcFile.path },
      read: { from: "cli", value: false },
      force: { from: "cli", value: false },
    });

    expect(vstsNpmAuthMock.callCount).toBe(1);
    expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
    expect(process.exitCode).toBe(1);
  },
);

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
  execaFunctionMock.mockRejectedValueOnce(new Error("Unexpected test error"));

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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

/**
 * Tests multiple unrecognized lines returned by vsts-npm-auth.
 * Verifies that the command preserves their original display order.
 */
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
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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

/**
 * Tests an unexpected Error with a nested Error cause.
 * Verifies that the actionable cause is included in the reported failure.
 */
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
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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

/**
 * Tests an unexpected rejection whose value is not an Error instance.
 * Verifies that the rejection is normalized into a terminal command failure.
 */
test("an unexpected non-Error rejection is handled", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const execaFunctionMock = vi.mocked(execa);
  execaFunctionMock.mockRejectedValueOnce("Unexpected non-Error rejection");

  await AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "cli", value: inMemoryNpmrcFile.path },
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

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});
