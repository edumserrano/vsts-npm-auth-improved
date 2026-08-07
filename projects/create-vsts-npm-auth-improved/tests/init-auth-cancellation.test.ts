import { afterEach, expect, test, vi } from "vitest";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Verifies cancellation at each interactive workflow stage.
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
 * Verifies cancellation at the initial project-root prompt.
 * Expected results:
 * - The command exits with a failure status.
 * - Existing package.json content does not change.
 * - The command does not create a .npmrc file.
 * - The command reports the cancellation.
 */
test("cancels at the root prompt without changing the filesystem", async () => {
  const project = await NpmProject.createAsync("root-cancelled");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().cancel();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies cancellation at the package-selection prompt after discovery.
 * Expected results:
 * - The command exits with a failure status before configuration starts.
 * - Existing package.json content does not change.
 * - The command does not create a .npmrc file.
 * - The command reports the cancellation.
 */
test("cancels at package selection without changing the filesystem", async () => {
  const project = await NpmProject.createAsync("selection-cancelled");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().cancel();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

test("cancels at installation strategy selection without changing the filesystem", async () => {
  const project = await NpmProject.createAsync("installation-strategy-cancelled");
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
    .cancel();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies cancellation at the registry prompt for a selected package.
 * Expected results:
 * - The command exits with a failure status and does not save prepared changes.
 * - Existing package.json content does not change.
 * - The command does not create a .npmrc file.
 * - The command reports the cancellation.
 */
test("cancels at the registry prompt without changing the filesystem", async () => {
  const project = await NpmProject.createAsync("registry-cancelled");
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
    .cancel();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies cancellation during registry collection for multiple selected packages.
 * Expected results:
 * - An earlier registry response does not save partial work.
 * - Cancellation at a later registry prompt gives a failure status and no writes.
 * - All selected packages keep their original files.
 */
test("cancels at a later registry prompt after planning with zero writes", async () => {
  const project = await NpmProject.createAsync("later-registry-cancelled");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: originalPackageJson,
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
    .submitText()
    .cancel();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([
    "alpha",
    "alpha/package.json",
    "beta",
    "beta/package.json",
  ]);
  for (const directory of ["alpha", "beta"]) {
    expect(await project.readFileAsync(`${directory}/package.json`)).toBe(originalPackageJson);
    expect(await project.existsAsync(`${directory}/.npmrc`)).toBe(false);
  }
  expect(output.normalizedOutput).toMatchSnapshot();
});
