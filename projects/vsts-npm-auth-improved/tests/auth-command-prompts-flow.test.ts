import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand, VstsNpmAuthImprovedCli } from "@test-utils/auth-command";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * Tests successful default and non-default prompt flows.
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

test("all prompts successful", async () => {
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
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-R"]);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

test("default command", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  const result = VstsNpmAuthImprovedCli.invokeAsync();
  await new PromptsInteraction()
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-R"]);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  expect(process.exitCode).toBe(0);
});

test("npm configuration path - initial value", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol, path: "./.npmrc" });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");
  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction().submitText().acceptSelectOption().acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-R"]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("Packaging (Read & Write) can be selected from the prompt", async () => {
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
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .down()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("forced acquisition can be selected from the prompt", async () => {
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
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .acceptSelectOption()
    .down()
    .acceptSelectOption();
  await result;

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

test("complete non-default prompt flow selects read-write scope and forced acquisition", async () => {
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
    .replaceText(inMemoryNpmrcFile.path)
    .submitText()
    .down()
    .acceptSelectOption()
    .down()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock.mock.calls.slice(1)).toHaveLength(0);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs(["-C", inMemoryNpmrcFile.path, "-F"]);
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
