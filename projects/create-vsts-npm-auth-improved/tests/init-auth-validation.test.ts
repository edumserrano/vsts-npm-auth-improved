import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  canonicalNpmrc,
  configuredPackageJsonContent,
  EXPECTED_MANAGED_NPM_CONFIG,
  packageJsonContent,
  parseNpmrcContent,
} from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Verifies root-directory and registry prompt validation and registry reuse.
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

const promptedRegistry = "https://registry.prompted.test/";

/**
 * Verifies correction of a project root that does not exist.
 * Expected results:
 * - The prompt shows the specified missing-directory message.
 * - The prompt accepts the next valid relative root.
 * - The corrected no-packages flow exits successfully without writes.
 */
test("shows invalid root feedback before accepting a valid correction", async () => {
  const project = await NpmProject.createAsync("corrected-root");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .replaceText("missing-directory")
    .submitText()
    .replaceText(".")
    .submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies selection of a project root with an absolute file-system path.
 * Expected results:
 * - The real directory prompt accepts the absolute path.
 * - Discovery completes successfully for that root.
 * - The empty project does not change.
 */
test("accepts an absolute root through the real directory prompt", async () => {
  const project = await NpmProject.createAsync("absolute-root");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .replaceText(path.resolve(project.root))
    .submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies correction of an empty project-root response.
 * Expected results:
 * - The prompt requires a directory path.
 * - The prompt accepts the next valid relative root.
 * - The corrected no-packages flow exits successfully without writes.
 */
test("shows empty-root feedback before accepting a valid correction", async () => {
  const project = await NpmProject.createAsync("empty-root-correction");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .clearText()
    .submitText()
    .replaceText(".")
    .submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies correction when the specified project root points to a file.
 * Expected results:
 * - The prompt explains that the selected path is not a directory.
 * - The prompt accepts the next valid relative root.
 * - The existing file does not change, and no writes occur.
 */
test("shows file-root feedback before accepting a valid correction", async () => {
  const project = await NpmProject.createAsync("file-root-correction");
  await project.writeFileAsync("file.txt", "");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .replaceText("file.txt")
    .submitText()
    .replaceText(".")
    .submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual(["file.txt"]);
  expect(await project.readFileAsync("file.txt")).toBe("");
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies registry validation before the test supplies a valid registry.
 * It uses empty, space-only, scheme-less, and relative values.
 * Expected results:
 * - Each invalid value causes the specified validation message.
 * - The prompt stays active and accepts a valid correction.
 * - Configuration of the selected package occurs only after successful validation.
 */
test.each([
  ["empty", ""],
  ["whitespace", "   "],
  ["missing-scheme", "registry.example.test"],
  ["relative", "/relative/registry"],
] as const)(
  "shows %s registry feedback before accepting a valid correction",
  async (fixtureName, invalidRegistry) => {
    const project = await NpmProject.createAsync(
      `corrected-registry-${fixtureName}`,
    );
    const originalPackageJson = packageJsonContent();
    await project.createPackageAsync({ packageJson: originalPackageJson });
    const output = mockStdoutWrite({
      temporaryRoots: [project.root],
    });
    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    await new PromptsInteraction()
      .submitText()
      .down()
      .toggleMultiselectItem()
      .acceptMultiselectValues()
      .acceptSelectValue()
      .enterText(invalidRegistry)
      .submitText()
      .replaceText(promptedRegistry)
      .submitText();
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
    expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(
      JSON.parse(configuredPackageJsonContent()),
    );
    expect(parseNpmrcContent(await project.readFileAsync(".npmrc"))).toMatchObject({
      registry: promptedRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    });
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Verifies accepted registry URL forms through the real registry prompt.
 * Expected results:
 * - The prompt accepts standard HTTPS and custom-scheme absolute URLs.
 * - The command saves the selected registry with the managed .npmrc settings.
 * - The command configures package.json and exits successfully.
 */
test.each([
  ["HTTPS", "https://registry.example.test/"],
  ["custom-scheme", "custom+npm://registry.example.test/feed"],
] as const)(
  "accepts a valid %s registry through the real registry prompt",
  async (fixtureName, registry) => {
    const project = await NpmProject.createAsync(`valid-registry-${fixtureName}`);
    const originalPackageJson = packageJsonContent();
    await project.createPackageAsync({ packageJson: originalPackageJson });
    const output = mockStdoutWrite({
      temporaryRoots: [project.root],
    });
    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    await new PromptsInteraction()
      .submitText()
      .down()
      .toggleMultiselectItem()
      .acceptMultiselectValues()
      .acceptSelectValue()
      .enterText(registry)
      .submitText();
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
    expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(
      JSON.parse(configuredPackageJsonContent()),
    );
    expect(parseNpmrcContent(await project.readFileAsync(".npmrc"))).toMatchObject({
      registry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    });
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Verifies a package whose .npmrc already contains a valid global registry.
 * Expected results:
 * - The command does not show the registry prompt.
 * - package.json receives the managed configuration.
 * - The canonical .npmrc content does not change.
 * - The command exits successfully with only the necessary write.
 */
test("reuses an existing global registry without showing a registry prompt", async () => {
  const project = await NpmProject.createAsync("existing-registry");
  const originalPackageJson = packageJsonContent();
  const originalNpmrc = canonicalNpmrc();
  await project.createPackageAsync({
    packageJson: originalPackageJson,
    npmrc: originalNpmrc,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(
    JSON.parse(configuredPackageJsonContent()),
  );
  expect(await project.readFileAsync(".npmrc")).toBe(originalNpmrc);
  expect(output.normalizedOutput).toMatchSnapshot();
});
