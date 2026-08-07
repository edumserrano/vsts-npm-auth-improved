import { test, expect, afterAll, afterEach, vi, beforeEach } from "vitest";
import { AuthCommand, VstsNpmAuthImprovedCli } from "@test-utils/auth-command";
import { vol } from "memfs";
import { createInMemoryNpmrcFile } from "@test-utils/npm-configuration-file";
import { mockStdoutWrite } from "@test-utils/process-output";
import { mockVstsNpmAuth } from "@test-utils/vsts-npm-auth";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * These tests verify the auth command when user prompts supply all options.
 * They examine prompt interactions. auth-command-cli.test.ts examines most other command behavior.
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

afterAll(() => {
  if (originalCiEnvironment === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCiEnvironment;
  }
});

beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
});

afterEach(() => {
  PromptsInteraction.resetPromptListeners();
  vi.resetAllMocks(); // Clear the call history of module mocks such as Execa.
  vi.restoreAllMocks(); // Restore the original implementations of spied functions.
  vol.reset();
  process.exitCode = undefined;
});

/**
 * Verifies successful authentication when prompts supply all necessary options.
 * Expected results:
 * - The test answers all prompts without errors.
 * - The command calls vsts-npm-auth one time with arguments from the prompt responses.
 * - The process exit code is 0.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
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

/**
 * Verifies that auth is the default command.
 * Expected results:
 * - The test answers all prompts without errors.
 * - The command calls vsts-npm-auth one time with arguments from the prompt responses.
 * - The process exit code is 0.
 *
 * CLI commands:
 * - vsts-npm-auth-improved
 */
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

/**
 * Verifies the validation of the npm configuration path prompt.
 * The test supplies a path that does not exist.
 * Expected result:
 * - The prompt output shows a validation error message.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
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

  // Cancel the prompt to complete the auth command Promise. This action prevents
  // output in subsequent tests. Without cancellation, the Promise continues to
  // use process.stdin and process.stdout during the other tests.
  await new PromptsInteraction().cancel();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(0);
  expect(process.exitCode).toBe(1);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies the validation of the npm configuration path prompt.
 * The test supplies an npm configuration file without a registry value.
 * Expected result:
 * - The prompt output shows a validation error message.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
test.each([
  { description: "no registry key", contents: "" },
  { description: "empty registry value", contents: "registry=" },
])(
  "npm configuration path - prompt validation - no registry found ($description)",
  async ({ contents }) => {
    const inMemoryNpmrcFile = createInMemoryNpmrcFile({
      vol,
      contents,
    });
    const stdoutWriteFunctionMock = mockStdoutWrite();
    const vstsNpmAuthMock = mockVstsNpmAuth("credentials-obtained");
    const result = AuthCommand.invokeAsync({
      type: "auth",
      configPath: { from: "prompt" },
      read: { from: "prompt" },
      force: { from: "prompt" },
    });
    await new PromptsInteraction().replaceText(inMemoryNpmrcFile.path).submitText();

    // Cancel the prompt to complete the auth command Promise. This action prevents
    // output in subsequent tests. Without cancellation, the Promise continues to
    // use process.stdin and process.stdout during the other tests.
    await new PromptsInteraction().cancel();
    await result;

    expect(vstsNpmAuthMock.callCount).toBe(0);
    expect(process.exitCode).toBe(1);
    expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Verifies the initial value of the npm configuration path prompt.
 * The user submits the value without an edit.
 * Expected result:
 * - The command accepts, validates, and uses the initial value without errors.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
test("npm configuration path - initial value", async () => {
  const inMemoryNpmrcFile = createInMemoryNpmrcFile({
    vol,
    path: "./.npmrc",
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
    .submitText()
    .acceptSelectOption()
    .acceptSelectOption();
  await result;

  expect(vstsNpmAuthMock.callCount).toBe(1);
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-R",
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies cancellation of the npm configuration path prompt.
 * Expected results:
 * - The prompt output shows the cancellation message.
 * - The process exit code is 1.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
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

/**
 * Verifies cancellation of the token-scope prompt.
 * Expected results:
 * - The prompt output shows the cancellation message.
 * - The process exit code is 1.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
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

/**
 * Verifies cancellation of the force prompt.
 * Expected results:
 * - The prompt output shows the cancellation message.
 * - The process exit code is 1.
 *
 * CLI command:
 * - vsts-npm-auth-improved auth
 */
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
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-R",
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});

test("configuration without a registry can be corrected before successful completion", async () => {
  const invalidConfigPath = "./config-without-registry/.npmrc";
  const validConfigPath = "./valid-config/.npmrc";
  vol.fromJSON({
    [invalidConfigPath]: "always-auth=true",
    [validConfigPath]:
      "registry=https://pkgs.dev.azure.com/org/_packaging/feed/npm/registry/",
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
  expect(vstsNpmAuthMock).toHaveBeenCalledWithVstsNpmAuthArgs([
    "-C",
    inMemoryNpmrcFile.path,
    "-F",
  ]);
  expect(process.exitCode).toBe(0);
  expect(stdoutWriteFunctionMock.normalizedOutput).toMatchSnapshot();
});
