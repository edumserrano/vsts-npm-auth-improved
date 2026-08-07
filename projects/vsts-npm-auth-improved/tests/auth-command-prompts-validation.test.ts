import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * Tests prompt validation failures and correction flows.
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
  PromptsInteraction.resetPromptListeners();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vol.reset();
  process.exitCode = undefined;
});

test("npm configuration path - prompt validation - file does not exist", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");
  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction()
    .replaceText("./this-dir-does-not-exist-in-memfs/.npmrc")
    .submitText();
  await new PromptsInteraction().cancel();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test.each([
  { description: "no registry key", contents: "" },
  { description: "empty registry value", contents: "registry=" },
])(
  "npm configuration path - prompt validation - no registry found ($description)",
  async ({ contents }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol, contents });
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");
    const result = AuthCommand.invokeAsync({
      type: "auth",
      configPath: { from: "prompt" },
      read: { from: "prompt" },
      force: { from: "prompt" },
    });
    await new PromptsInteraction().replaceText(inMemoryNpmrcFile.path).submitText();
    await new PromptsInteraction().cancel();
    await result;

    expect(vstsNpmAuthMock.callCount).toBe(0);
    expect(process.exitCode).toBe(1);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

test("invalid configuration path can be corrected before successful completion", async () => {
  const invalidConfigPath = "./this-dir-does-not-exist-in-memfs/.npmrc";
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction()
    .replaceText(invalidConfigPath)
    .submitText()
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-R"]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("configuration without a registry can be corrected before successful completion", async () => {
  const invalidConfigPath = "./config-without-registry/.npmrc";
  const validConfigPath = "./valid-config/.npmrc";
  vol.fromJSON({
    [invalidConfigPath]: "always-auth=true",
    [validConfigPath]: "registry=https://pkgs.dev.azure.com/org/_packaging/feed/npm/registry/",
  });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction()
    .replaceText(invalidConfigPath)
    .submitText()
    .replaceText(validConfigPath)
    .submitText()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", validConfigPath, "-R"]);
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
