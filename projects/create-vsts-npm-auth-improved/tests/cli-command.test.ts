import { afterEach, expect, test, vi } from "vitest";
import {
  CreateVstsNpmAuthImprovedCli,
  InitAuthCommand,
  InitAuthInvocation,
} from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { captureProcessOutput, mockStdoutWrite } from "@test-utils/process-output";

/**
 * These tests verify the CLI entry commands, information output, and top-level error processing.
 */

const testSuiteCwd = process.cwd();

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

/**
 * Verifies the default command and the explicit init-auth subcommand.
 * Expected results:
 * - Both command forms start the real interactive workflow and complete successfully.
 * - The no-packages flow does not change the selected project.
 * - The terminal text shows the command form that started.
 *
 * CLI commands:
 * - create-vsts-npm-auth-improved
 * - create-vsts-npm-auth-improved init-auth
 */
test.each([
  ["default command", "default"],
  ["explicit init-auth command", "explicit"],
] as const)("dispatches the %s through the real workflow", async (_description, invocation) => {
  const project = await NpmProject.createAsync(`dispatch-${invocation}`);
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync({
    invocation: invocation satisfies InitAuthInvocation,
  });
  await new PromptsInteraction().submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies the root and init-auth help options and the root version options.
 * The test also verifies their short aliases.
 * Expected results:
 * - Each information command exits successfully.
 * - The commands do not create or change project files.
 * - The complete stdout output agrees with the expected output.
 */
test.each([
  ["long root help", ["--help"]],
  ["short root help", ["-h"]],
  ["long init-auth help", ["init-auth", "--help"]],
  ["short init-auth help", ["init-auth", "-h"]],
  ["long version", ["--version"]],
  ["short version", ["-v"]],
] as const)("renders complete %s output", async (_description, argv) => {
  const project = await NpmProject.createAsync("command-output");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  await CreateVstsNpmAuthImprovedCli.invokeAsync([...argv]);

  expect(process.exitCode).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies the CLI response to an unrecognized subcommand.
 * Expected results:
 * - Commander reports the failure with process exit code 1.
 * - The project file system does not change.
 * - The terminal text contains the expected usage error.
 *
 * CLI command:
 * - create-vsts-npm-auth-improved not-a-command
 */
test("reports an unknown command with the effective Commander exit code", async () => {
  const project = await NpmProject.createAsync("unknown-command");
  const output = captureProcessOutput({
    captureStderr: true,
    temporaryRoots: [project.root],
  });

  await CreateVstsNpmAuthImprovedCli.invokeAsync(["not-a-command"]);

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.stdout.normalizedOutput).toMatchSnapshot();
  expect(output.stderr?.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies command-level processing when terminal output throws an Error. This
 * error occurs outside the specified init-auth failure boundaries.
 */
test("reports an unexpected Error from the terminal boundary", async () => {
  const project = await NpmProject.createAsync("unexpected-terminal-error");
  const unexpectedError = new Error("unexpected Error terminal failure", {
    cause: new Error("unexpected terminal cause"),
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  output.write.mockImplementationOnce(() => {
    throw unexpectedError;
  });

  process.chdir(project.root);
  await InitAuthCommand.invokeAsync();

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies top-level processing when a dependency throws a value that is not an Error.
 * Expected results:
 * - The command exits with process exit code 1.
 * - The empty project does not change.
 * - The command processes the value before it gets to the CLI fallback.
 */
test("reports an unexpected non-Error value from the terminal boundary", async () => {
  const project = await NpmProject.createAsync("unexpected-non-error");
  const unexpectedValue = "unexpected non-Error terminal failure";
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  output.write.mockImplementationOnce(() => {
    throw unexpectedValue;
  });

  process.chdir(project.root);
  await InitAuthCommand.invokeAsync();

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies the outer CLI fallback through the terminal boundary. The failure
 * occurs before Commander starts to parse the command.
 */
test("reports a top-level terminal failure", async () => {
  const project = await NpmProject.createAsync("top-level-cli-failure");
  const unexpectedValue = "Unexpected top-level terminal failure";
  const consoleLog = vi.spyOn(console, "log").mockImplementationOnce(() => {
    throw unexpectedValue;
  });

  await CreateVstsNpmAuthImprovedCli.invokeAsync([]);

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(consoleLog).toHaveBeenNthCalledWith(1);
  expect(consoleLog).toHaveBeenNthCalledWith(
    2,
    "🚨 Unexpected error:",
    unexpectedValue,
  );
});
