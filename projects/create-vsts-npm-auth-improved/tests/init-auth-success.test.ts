import { afterEach, expect, test, vi } from "vitest";
import {
  configuredPackageJsonContent,
  EXPECTED_MANAGED_NPM_CONFIG,
  packageJsonContent,
  parseNpmrcContent,
} from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import {
  mockStdoutWrite,
  OutputChannelCapture,
} from "@test-utils/process-output";

/**
 * These tests verify successful end-to-end init-auth workflows. They include
 * package selection, save reports, and repeated runs.
 */

const testSuiteCwd = process.cwd();
const promptedRegistry = "https://prompted.test/";
const existingRegistry = "https://existing.test/";
const originalPackageJson = packageJsonContent();
const configuredPackageJson = configuredPackageJsonContent();

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

/**
 * Verifies the supported multiselect combinations for discovered packages.
 * Expected results:
 * - Individual, subset, multiple-package, ALL, and mixed ALL selections give the correct packages.
 * - Only selected package.json files receive the managed configuration.
 * - Existing canonical .npmrc files do not change.
 * - The command exits successfully and reports selected packages in order.
 */
test.each([
  ["one package", [2], ["beta"]],
  ["a subset", [1, 3], ["alpha", "gamma"]],
  ["multiple individual packages", [1, 2, 3], ["alpha", "beta", "gamma"]],
  ["ALL", [0], ["alpha", "beta", "gamma"]],
  ["ALL mixed with an individual package", [0, 2], ["alpha", "beta", "gamma"]],
] as const)(
  "configures %s through a complete CLI selection",
  async (_description, choicePositions, selectedPackages) => {
    const project = await NpmProject.createAsync(`selection-${_description}`);
    const packageNames = ["alpha", "beta", "gamma"] as const;
    for (const packageName of packageNames) {
      await project.createPackageAsync({
        directory: packageName,
        packageJson: originalPackageJson,
        npmrc: canonicalNpmrc(existingRegistry),
      });
    }
    const output = mockStdoutWrite({
      temporaryRoots: [project.root],
    });
    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    const interaction = new PromptsInteraction().submitText();
    selectChoices(interaction, choicePositions);
    interaction.acceptSelectValue();
    await interaction;
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    expect(await project.readTreeAsync()).toEqual([
      "alpha",
      "alpha/.npmrc",
      "alpha/package.json",
      "beta",
      "beta/.npmrc",
      "beta/package.json",
      "gamma",
      "gamma/.npmrc",
      "gamma/package.json",
    ]);
    for (const packageName of packageNames) {
      const packageJson = await project.readFileAsync(
        `${packageName}/package.json`,
      );
      if (
        selectedPackages.some(
          (selectedPackage) => selectedPackage === packageName,
        )
      ) {
        expect(JSON.parse(packageJson)).toEqual(JSON.parse(configuredPackageJson));
      } else {
        expect(packageJson).toBe(originalPackageJson);
      }
      expect(await project.readFileAsync(`${packageName}/.npmrc`)).toBe(
        canonicalNpmrc(existingRegistry),
      );
    }
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Verifies one run with unchanged, updated, and new package files.
 * Expected results:
 * - Each package receives the necessary final package.json and .npmrc content.
 * - The command writes only files with changed content.
 * - Registry prompts occur only for packages without an effective registry.
 * - Save results occur in write order.
 */
test("reports mixed created updated and unchanged outcomes in persistence order", async () => {
  const project = await NpmProject.createAsync("mixed-outcomes");
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: configuredPackageJson,
    npmrc: canonicalNpmrc("https://alpha.test/"),
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: originalPackageJson,
    npmrc: `registry=https://beta.test/\naudit=true`,
  });
  await project.createPackageAsync({
    directory: "gamma",
    packageJson: configuredPackageJson,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue()
    .enterText(promptedRegistry)
    .submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([
    "alpha",
    "alpha/.npmrc",
    "alpha/package.json",
    "beta",
    "beta/.npmrc",
    "beta/package.json",
    "gamma",
    "gamma/.npmrc",
    "gamma/package.json",
  ]);
  expect(await project.readFileAsync("alpha/package.json")).toBe(
    configuredPackageJson,
  );
  expect(await project.readFileAsync("alpha/.npmrc")).toBe(
    canonicalNpmrc("https://alpha.test/"),
  );
  expect(JSON.parse(await project.readFileAsync("beta/package.json"))).toEqual(
    JSON.parse(configuredPackageJson),
  );
  expect(parseNpmrcContent(await project.readFileAsync("beta/.npmrc"))).toMatchObject({
    registry: "https://beta.test/",
    ...EXPECTED_MANAGED_NPM_CONFIG,
  });
  expect(await project.readFileAsync("gamma/package.json")).toBe(
    configuredPackageJson,
  );
  expect(parseNpmrcContent(await project.readFileAsync("gamma/.npmrc"))).toMatchObject({
    registry: promptedRegistry,
    ...EXPECTED_MANAGED_NPM_CONFIG,
  });
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies idempotency with two complete interactive runs on the same package.
 * Expected results:
 * - The first run creates the expected package.json and .npmrc configuration.
 * - The second run keeps exactly the same content.
 * - The second run does not require a registry prompt or write files.
 * - Both runs exit successfully and report the expected results.
 */
test("a second complete CLI run is idempotent for package.json and .npmrc", async () => {
  const project = await NpmProject.createAsync("complete-idempotency");
  await project.createPackageAsync({
    packageJson: originalPackageJson,
  });

  const firstOutput = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const firstCommand = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue()
    .enterText(promptedRegistry)
    .submitText();
  await firstCommand;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  const firstPackageJson = await project.readFileAsync("package.json");
  const firstNpmrc = await project.readFileAsync(".npmrc");
  expect(JSON.parse(firstPackageJson)).toEqual(JSON.parse(configuredPackageJson));
  expect(parseNpmrcContent(firstNpmrc)).toMatchObject({
    registry: promptedRegistry,
    ...EXPECTED_MANAGED_NPM_CONFIG,
  });
  const firstTranscript = firstOutput.normalizedOutput;
  expect(firstTranscript).toMatchSnapshot();
  restoreOutput(firstOutput);

  process.exitCode = undefined;
  const secondOutput = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  const secondCommand = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue();
  await secondCommand;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(firstPackageJson);
  expect(await project.readFileAsync(".npmrc")).toBe(firstNpmrc);
  expect(secondOutput.normalizedOutput).toMatchSnapshot();
});

function selectChoices(
  interaction: PromptsInteraction,
  choicePositions: readonly number[],
): void {
  let currentPosition = 0;
  for (const choicePosition of choicePositions) {
    for (let index = currentPosition; index < choicePosition; index += 1) {
      interaction.down();
    }
    interaction.toggleMultiselectItem();
    currentPosition = choicePosition;
  }
  interaction.acceptMultiselectValues();
}

function canonicalNpmrc(registry: string): string {
  return [
    `registry=${registry}`,
    "package-lock=true",
    "audit=false",
    "fund=false",
  ].join("\n");
}

function restoreOutput(output: OutputChannelCapture): void {
  output.write.mockRestore();
}
