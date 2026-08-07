import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthCommand } from "@test-utils/auth-command";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * Tests cancellation at each prompt in the authentication flow.
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

test("npm configuration path prompt cancelled", async () => {
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");
  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction().cancel();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("token scope select prompt cancelled", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({ vol });
  const stdoutWriteFunctionMock = mockStdoutWrite();
  const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");

  const result = AuthCommand.invokeAsync({
    type: "auth",
    configPath: { from: "prompt" },
    read: { from: "prompt" },
    force: { from: "prompt" },
  });
  await new PromptsInteraction().replaceText(inMemoryNpmrcFile.path).submitText().cancel();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("force token acquisition select prompt cancelled", async () => {
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
    .cancel();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(0);
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
