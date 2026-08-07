import { symlink } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Verifies package discovery and package selection in the interactive workflow.
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
 * Verifies the workflow when the selected root contains no package.json files.
 * Expected results:
 * - The command exits successfully after discovery.
 * - The command does not create or write files.
 * - The terminal output reports that the command found no packages.
 */
test("reports that no packages were discovered", async () => {
  const project = await NpmProject.createAsync("no-packages");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync({ invocation: "explicit" });
  await new PromptsInteraction().submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies acceptance of the package multiselect without a package selection.
 * Expected results:
 * - The command exits successfully before configuration.
 * - The discovered package does not change.
 * - The command does not create a .npmrc file or write other files.
 * - The terminal output reports the empty selection.
 */
test("reports that packages were discovered but none were selected", async () => {
  const project = await NpmProject.createAsync("no-selection");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies recursive package discovery and the order in the package-selection prompt.
 * Expected results:
 * - Root and nested packages occur in a repeatable path order.
 * - The command excludes hidden and dependency directories.
 * - The command finds standard output directories when ignore rules do not exclude them.
 * - An empty package selection does not change fixtures.
 */
test("shows deterministic nested discovery while excluding dependency and hidden directories", async () => {
  const project = await NpmProject.createAsync("discovery-order");
  const originalPackageJson = packageJsonContent();
  const includedDirectories = [
    "",
    "alpha",
    "alpha/nested",
    "dist",
    "build",
    "coverage",
    "test-reporters",
    "zeta",
  ];
  const excludedDirectories = [".git", ".hidden", "node_modules"];
  for (const directory of [...includedDirectories, ...excludedDirectories]) {
    await project.createPackageAsync({
      directory,
      packageJson: originalPackageJson,
    });
  }
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([
    ".git",
    ".git/package.json",
    ".hidden",
    ".hidden/package.json",
    "alpha",
    "alpha/nested",
    "alpha/nested/package.json",
    "alpha/package.json",
    "build",
    "build/package.json",
    "coverage",
    "coverage/package.json",
    "dist",
    "dist/package.json",
    "node_modules",
    "node_modules/package.json",
    "package.json",
    "test-reporters",
    "test-reporters/package.json",
    "zeta",
    "zeta/package.json",
  ]);
  for (const directory of [...includedDirectories, ...excludedDirectories]) {
    const packagePath = directory === "" ? "package.json" : `${directory}/package.json`;
    expect(await project.readFileAsync(packagePath)).toBe(originalPackageJson);
    expect(await project.existsAsync(directory === "" ? ".npmrc" : `${directory}/.npmrc`)).toBe(
      false,
    );
  }
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies that path case does not affect the node_modules exclusion.
 * Expected results:
 * - The command finds normal packages and a mixed-case dist directory.
 * - The command excludes an uppercase node_modules directory.
 * - The discovery-only flow does not change the file system.
 */
test("excludes node_modules case-insensitively", async () => {
  const project = await NpmProject.createAsync("case-insensitive-discovery");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({
    directory: "packages",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "NODE_MODULES",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "DiSt",
    packageJson: originalPackageJson,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([
    "DiSt",
    "DiSt/package.json",
    "NODE_MODULES",
    "NODE_MODULES/package.json",
    "packages",
    "packages/package.json",
  ]);
  for (const directory of ["DiSt", "NODE_MODULES", "packages"]) {
    expect(await project.readFileAsync(`${directory}/package.json`)).toBe(originalPackageJson);
    expect(await project.existsAsync(`${directory}/.npmrc`)).toBe(false);
  }
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies Git ignore rules at the selected root and in nested directories.
 * Expected results:
 * - Root and nested ignore files exclude matching packages.
 * - A nested negation can include a package again.
 * - The command finds packages that are not ignored in a repeatable order.
 */
test("respects root, nested, and negated gitignore rules", async () => {
  const project = await NpmProject.createAsync("gitignore-rules");
  const originalPackageJson = packageJsonContent();
  for (const directory of [
    "",
    "ignored-root",
    "packages/ignored",
    "packages/kept",
    "packages/reincluded",
  ]) {
    await project.createPackageAsync({
      directory,
      packageJson: originalPackageJson,
    });
  }
  await project.writeFileAsync(".gitignore", "ignored-root/\n");
  await project.writeFileAsync(
    "packages/.gitignore",
    "ignored/\nreincluded/\n!reincluded/\n!reincluded/package.json\n",
  );

  const output = mockStdoutWrite({ temporaryRoots: [project.root] });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).toContain("◻ package.json");
  expect(output.normalizedOutput).toContain("packages/kept/package.json");
  expect(output.normalizedOutput).toContain("packages/reincluded/package.json");
  expect(output.normalizedOutput).not.toContain("ignored-root/package.json");
  expect(output.normalizedOutput).not.toContain("packages/ignored/package.json");
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies discovery when the selected root is below the Git repository root.
 * The command must resolve parent .gitignore rules relative to their file.
 */
test("respects parent gitignore rules up to the repository root", async () => {
  const project = await NpmProject.createAsync("parent-gitignore");
  const originalPackageJson = packageJsonContent();
  await project.writeFileAsync(".git/keep", "");
  await project.writeFileAsync(".gitignore", "workspace/ignored/\n");
  await project.createPackageAsync({
    directory: "workspace/ignored",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "workspace/kept",
    packageJson: originalPackageJson,
  });

  const output = mockStdoutWrite({ temporaryRoots: [project.root] });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().replaceText("workspace").submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(output.normalizedOutput).toContain("◻ kept/package.json");
  expect(output.normalizedOutput).not.toContain("ignored/package.json");
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies recursive discovery when the selected root contains a linked directory.
 * Expected results:
 * - The command finds a real child package.
 * - The command does not follow a directory symbolic link to a package.
 * - The command does not change the selected project or the link target.
 */
test("does not follow a symbolic-link directory during discovery", async () => {
  const project = await NpmProject.createAsync("discovery-symlink");
  const linkedProject = await NpmProject.createAsync("discovery-symlink-target");
  const originalPackageJson = packageJsonContent();
  await project.createPackageAsync({
    directory: "actual",
    packageJson: originalPackageJson,
  });
  await linkedProject.createPackageAsync({ packageJson: originalPackageJson });
  await symlink(linkedProject.root, project.path("linked"), "junction");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root, linkedProject.root],
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText().acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual(["actual", "actual/package.json", "linked"]);
  expect(await project.readFileAsync("actual/package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync("actual/.npmrc")).toBe(false);
  expect(await linkedProject.readTreeAsync()).toEqual(["package.json"]);
  expect(await linkedProject.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await linkedProject.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});
