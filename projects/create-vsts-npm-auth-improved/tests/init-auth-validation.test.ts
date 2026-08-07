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
 * Tests root-directory and registry prompt validation and registry reuse.
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
 * Tests correction of a project root that does not exist.
 * Verifies that:
 * - The prompt displays targeted missing-directory feedback
 * - A subsequent valid relative root is accepted
 * - The corrected no-packages flow exits successfully without writes
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
 * Tests selecting a project root with an absolute filesystem path.
 * Verifies that:
 * - The real directory prompt accepts the absolute path
 * - Discovery completes successfully for that root
 * - The empty project remains unchanged
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
 * Tests correction of an empty project-root response.
 * Verifies that:
 * - The prompt requires a directory path
 * - A subsequent valid relative root is accepted
 * - The corrected no-packages flow exits successfully without writes
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
 * Tests correction when the supplied project root points to a file.
 * Verifies that:
 * - The prompt explains that the selected path is not a directory
 * - A subsequent valid relative root is accepted
 * - The existing file remains unchanged and no writes occur
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
 * Tests registry validation for empty, whitespace-only, scheme-less, and relative
 * values before a valid registry is supplied.
 * Verifies that:
 * - Each invalid value produces the targeted validation message
 * - The prompt remains active and accepts a valid correction
 * - The selected package is configured only after validation succeeds
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
 * Tests accepted registry URL forms through the real registry prompt.
 * Verifies that:
 * - Standard HTTPS and custom-scheme absolute URLs are accepted
 * - The chosen registry is persisted with the managed .npmrc settings
 * - package.json is configured and the command exits successfully
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
 * Tests configuration of a package whose .npmrc already contains a valid global registry.
 * Verifies that:
 * - No registry prompt is displayed
 * - package.json receives the managed configuration
 * - The canonical .npmrc content is preserved
 * - The command exits successfully with only the required write
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
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(
    JSON.parse(configuredPackageJsonContent()),
  );
  expect(await project.readFileAsync(".npmrc")).toBe(originalNpmrc);
  expect(output.normalizedOutput).toMatchSnapshot();
});
