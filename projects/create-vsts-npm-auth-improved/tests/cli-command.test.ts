import { Command } from "commander";
import { afterEach, expect, test, vi } from "vitest";
import {
  loadNpmPackageJsonFile,
  NpmPackageJsonFileError,
} from "../src/init-auth/package-files/npm-package-json-file";
import {
  CreateVstsNpmAuthImprovedCli,
  InitAuthCommand,
  InitAuthInvocation,
} from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import {
  captureProcessOutput,
  mockStdoutWrite,
} from "@test-utils/process-output";

/**
 * The tests below verify the create-vsts-npm-auth-improved CLI entry commands,
 * informational output, and top-level error handling.
 */

vi.mock(
  "../src/init-auth/package-files/npm-package-json-file",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../src/init-auth/package-files/npm-package-json-file")
    >();
    return {
      ...actual,
      loadNpmPackageJsonFile: vi.fn(actual.loadNpmPackageJsonFile),
    };
  },
);

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
 * Tests that both the default invocation and the explicit init-auth subcommand
 * dispatch to the real interactive workflow.
 * Verifies that:
 * - Both command forms complete successfully
 * - The no-packages flow leaves the selected project unchanged
 * - The terminal transcript reflects the command form that was invoked
 *
 * CLI commands:
 * - create-vsts-npm-auth-improved
 * - create-vsts-npm-auth-improved init-auth
 */
test.each([
  ["default command", "default"],
  ["explicit init-auth command", "explicit"],
] as const)("dispatches the %s through the real workflow", async (
  _description,
  invocation,
) => {
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
 * Tests the root and init-auth help options and the root version options,
 * including their short aliases.
 * Verifies that:
 * - Each informational command exits successfully
 * - No project files are created or modified
 * - The complete stdout output is rendered as expected
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
 * Tests the CLI response to an unrecognized subcommand.
 * Verifies that:
 * - Commander reports the failure with process exit code 1
 * - The project filesystem remains unchanged
 * - The terminal transcript contains the expected usage error
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
 * Tests handling of an operational Error thrown while reading a package file.
 * Verifies that:
 * - The command exits with process exit code 1
 * - No package.json or .npmrc content is changed
 * - The contextual read failure is presented without the unexpected fallback
 */
test("reports a known Error from the package adapter boundary", async () => {
  const project = await NpmProject.createAsync("filesystem-read-failure");
  await project.createPackageAsync({ packageJson: "{}" });
  const originalState = {
    tree: await project.readTreeAsync(),
    packageJson: await project.readFileAsync("package.json"),
    npmrcExists: await project.existsAsync(".npmrc"),
  };
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  vi.mocked(loadNpmPackageJsonFile).mockRejectedValueOnce(
    new NpmPackageJsonFileError("read", project.path("package.json"), {
      cause: new Error("filesystem read failed"),
    }),
  );

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect({
    tree: await project.readTreeAsync(),
    packageJson: await project.readFileAsync("package.json"),
    npmrcExists: await project.existsAsync(".npmrc"),
  }).toEqual(originalState);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests command-level handling when terminal output throws an Error outside
 * the modeled init-auth failure boundaries.
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
 * Tests top-level handling when a dependency throws a value that is not an
 * Error instance.
 * Verifies that:
 * - The command exits with process exit code 1
 * - The empty project remains unchanged
 * - The thrown value is handled without escaping to the CLI fallback
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
 * Tests the outer CLI fallback for failures that occur outside the init-auth
 * command handler.
 */
test("reports a top-level non-Commander CLI failure", async () => {
  const project = await NpmProject.createAsync("top-level-cli-failure");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const unexpectedValue = "Unexpected top-level non-Commander failure";
  vi.spyOn(Command.prototype, "parseAsync").mockRejectedValueOnce(
    unexpectedValue,
  );

  await CreateVstsNpmAuthImprovedCli.invokeAsync([]);

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(consoleLog).toHaveBeenNthCalledWith(1);
  expect(consoleLog).toHaveBeenNthCalledWith(
    2,
    "🚨 Unexpected error:",
    unexpectedValue,
  );
  expect(output.normalizedOutput).toMatchSnapshot();
});
