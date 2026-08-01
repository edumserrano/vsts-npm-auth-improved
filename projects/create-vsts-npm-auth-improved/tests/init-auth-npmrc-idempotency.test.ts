import { afterEach, expect, test, vi } from "vitest";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import {
  configuredPackageJsonContent,
  EXPECTED_MANAGED_NPM_CONFIG,
  parseNpmrcContent,
} from "@test-utils/configuration-fixtures";
import {
  restoreCapturedOutput,
  runSinglePackageScenario,
} from "@test-utils/init-auth-scenario";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Tests that .npmrc normalization is idempotent.
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

const existingRegistry = "https://existing.test/";

/**
 * Tests that .npmrc normalization reaches a stable semantic result.
 * Verifies that:
 * - The first run writes the required effective values
 * - A second complete run produces identical files
 * - Both command transcripts report successful outcomes
 */
test(
  "keeps .npmrc semantically idempotent after normalization",
  async () => {
    const npmrc = [
      `registry=${existingRegistry}`,
      "audit=true",
      "audit=false",
      "package-lock=false",
      "lockfile-version=2",
      "legacy-peer-deps=false",
      "fund=true",
    ].join("\n");
    const scenario = await runSinglePackageScenario({
      name: "npmrc-semantic-idempotency",
      packageJson: configuredPackageJsonContent(),
      npmrc,
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([
      ".npmrc",
      "package.json",
    ]);
    expect(await scenario.project.readFileAsync("package.json")).toBe(
      configuredPackageJsonContent(),
    );
    const firstNpmrc = await scenario.project.readFileAsync(".npmrc");
    expect(parseNpmrcContent(firstNpmrc)).toMatchObject({
      registry: existingRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    });
    expect(scenario.output.normalizedOutput).toMatchSnapshot();
    restoreCapturedOutput(scenario.output);

    process.exitCode = undefined;
    const secondOutput = mockStdoutWrite({
      temporaryRoots: [scenario.project.root],
    });
    const secondCommand = InitAuthCommand.invokeAsync();
    await new PromptsInteraction()
      .enterText(".")
      .submitText()
      .down()
      .toggleMultiselectItem()
      .acceptMultiselectValues();
    await secondCommand;

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([
      ".npmrc",
      "package.json",
    ]);
    expect(await scenario.project.readFileAsync("package.json")).toBe(
      configuredPackageJsonContent(),
    );
    expect(await scenario.project.readFileAsync(".npmrc")).toBe(firstNpmrc);
    expect(secondOutput.normalizedOutput).toMatchSnapshot();
  },
);
