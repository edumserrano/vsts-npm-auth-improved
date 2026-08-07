import { afterEach, expect, test, vi } from "vitest";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { mockStdoutWrite, OutputChannelCapture } from "@test-utils/process-output";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * These tests verify the complete CLI decision to display or suppress the
 * post-write Git ignore warning through real temporary filesystem fixtures and
 * the public CLI.
 */

const testSuiteCwd = process.cwd();
const warningLead = "The following .npmrc files were created or updated but are ignored by Git.";

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

/**
 * Tests a changed .npmrc file that is ignored by Git.
 * Verifies that the command displays the credential-safety warning.
 */
test("displays the Git ignore warning when changed npmrc files are ignored", async () => {
  const output = await invokeInitAuth("warning-shown", {
    gitignore: ".npmrc\n",
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).toContain(warningLead);
  expect(output.normalizedOutput).toContain("- .npmrc");
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests changed .npmrc files that are not ignored by Git.
 * Verifies that the credential-safety warning is not displayed.
 */
test("does not display the Git ignore warning when no changed npmrc files are ignored", async () => {
  const output = await invokeInitAuth("warning-not-required");

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).not.toContain(warningLead);
  expect(output.normalizedOutput).toMatchSnapshot();
});

type InitAuthWarningScenario = {
  readonly gitignore?: string;
};

async function invokeInitAuth(
  fixtureName: string,
  scenario: InitAuthWarningScenario = {},
): Promise<OutputChannelCapture> {
  const project = await NpmProject.createAsync(fixtureName);
  await project.createPackageAsync({ packageJson: packageJsonContent() });
  if (scenario.gitignore !== undefined) {
    await project.writeFileAsync(".gitignore", scenario.gitignore);
  }

  const output = mockStdoutWrite({ temporaryRoots: [project.root] });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue()
    .enterText("https://registry.example.test/")
    .submitText();
  await command;

  expect(await project.existsAsync(".npmrc")).toBe(true);
  return output;
}
