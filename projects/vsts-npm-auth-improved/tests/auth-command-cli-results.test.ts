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
