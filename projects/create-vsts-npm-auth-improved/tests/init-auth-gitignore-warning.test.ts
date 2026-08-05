import { afterEach, expect, test, vi } from "vitest";
import {
  checkChangedNpmrcFilesForGitignoreAsync,
  NpmrcGitignoreCheckResult,
} from "../src/init-auth/auth-setup/npmrc-gitignore-check";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { mockStdoutWrite, OutputChannelCapture } from "@test-utils/process-output";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * These tests verify the complete CLI decision to display or suppress the
 * post-write Git ignore warning. Detection itself is covered separately; this
 * suite injects its typed result at that narrow boundary and invokes cliAsync
 * through InitAuthCommand.
 */

vi.mock(
  "../src/init-auth/auth-setup/npmrc-gitignore-check",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../src/init-auth/auth-setup/npmrc-gitignore-check")
    >();
    return {
      ...actual,
      checkChangedNpmrcFilesForGitignoreAsync: vi.fn(
        actual.checkChangedNpmrcFilesForGitignoreAsync,
      ),
    };
  },
);

const testSuiteCwd = process.cwd();
const warningLead =
  "The following .npmrc files were created or updated but are ignored by Git.";

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

test("displays the Git ignore warning when changed npmrc files are ignored", async () => {
  const output = await invokeInitAuth("warning-shown", {
    gitignore: ".npmrc\n",
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).toContain(warningLead);
  expect(output.normalizedOutput).toContain("- .npmrc");
  expect(output.normalizedOutput).toMatchSnapshot();
});

test("does not display the Git ignore warning when no changed npmrc files are ignored", async () => {
  const output = await invokeInitAuth("warning-not-required");

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).not.toContain(warningLead);
  expect(output.normalizedOutput).toMatchSnapshot();
});

test("does not display the Git ignore warning when the check fails", async () => {
  const output = await invokeInitAuth("warning-check-failed", {
    checkResult: {
      status: "failed",
      cause: new Error("ignore check failed"),
    },
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).not.toContain(warningLead);
  expect(output.normalizedOutput).not.toContain("ignore check failed");
  expect(output.normalizedOutput).toMatchSnapshot();
});

type InitAuthWarningScenario = {
  readonly checkResult?: NpmrcGitignoreCheckResult;
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

  if (scenario.checkResult !== undefined) {
    vi.mocked(checkChangedNpmrcFilesForGitignoreAsync).mockResolvedValueOnce(
      scenario.checkResult,
    );
  }

  const output = mockStdoutWrite({ temporaryRoots: [project.root] });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .enterText("https://registry.example.test/")
    .submitText();
  await command;

  expect(checkChangedNpmrcFilesForGitignoreAsync).toHaveBeenCalledOnce();
  expect(await project.existsAsync(".npmrc")).toBe(true);
  return output;
}
