import { symlink } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { discoverPackageJsonFiles } from "../src/init-auth/package-files/package-json-discovery";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Tests package discovery and package selection in the interactive workflow.
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
 * Tests the workflow when the selected root contains no package.json files.
 * Verifies that:
 * - The command exits successfully after discovery
 * - No files are written or created
 * - The terminal output reports that no packages were found
 */
test("reports that no packages were discovered", async () => {
  const project = await NpmProject.createAsync("no-packages");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync({ invocation: "explicit" });
  await new PromptsInteraction().enterText("./").submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests accepting the package multiselect without choosing any packages.
 * Verifies that:
 * - The command exits successfully without continuing to configuration
 * - The discovered package remains unchanged and no .npmrc is created
 * - No writes occur and the terminal output reports the empty selection
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
  await new PromptsInteraction()
    .enterText(".")
    .submitText()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests recursive package discovery and the ordering of choices shown in the
 * package-selection prompt.
 * Verifies that:
 * - Root and nested packages are displayed in deterministic path order
 * - Hidden and dependency directories are excluded
 * - Conventional output directory names remain discoverable when not ignored
 * - Selecting no packages leaves every fixture unchanged
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
  await new PromptsInteraction()
    .enterText(".")
    .submitText()
    .acceptMultiselectValues();
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
    const packagePath =
      directory === "" ? "package.json" : `${directory}/package.json`;
    expect(await project.readFileAsync(packagePath)).toBe(originalPackageJson);
    expect(
      await project.existsAsync(
        directory === "" ? ".npmrc" : `${directory}/.npmrc`,
      ),
    ).toBe(false);
  }
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests that the node_modules exclusion does not depend on path casing.
 * Verifies that:
 * - Normal packages and a mixed-case dist directory are discovered
 * - An uppercase node_modules directory is excluded
 * - The discovery-only flow makes no filesystem changes
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
  await new PromptsInteraction()
    .enterText(".")
    .submitText()
    .acceptMultiselectValues();
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
    expect(await project.readFileAsync(`${directory}/package.json`)).toBe(
      originalPackageJson,
    );
    expect(await project.existsAsync(`${directory}/.npmrc`)).toBe(false);
  }
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests Git ignore rules at the selected root and in nested directories.
 * Verifies that:
 * - Root and nested ignore files exclude matching packages
 * - A nested negation can re-include a package
 * - Unignored packages remain discoverable in deterministic order
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

  const discoveryResult = await discoverPackageJsonFiles(project.root);

  expect(discoveryResult.status).toBe("found");
  if (discoveryResult.status !== "found") {
    throw discoveryResult.failure.cause;
  }
  expect(
    discoveryResult.packageJsonPaths.map(filePath =>
      project.normalizePath(filePath),
    ),
  ).toEqual([
    "<test-root>/package.json",
    "<test-root>/packages/kept/package.json",
    "<test-root>/packages/reincluded/package.json",
  ]);
});

/**
 * Tests discovery when the selected root is below the Git repository root.
 * Verifies that parent .gitignore rules are resolved relative to their file.
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

  const discoveryResult = await discoverPackageJsonFiles(
    project.path("workspace"),
  );

  expect(discoveryResult.status).toBe("found");
  if (discoveryResult.status !== "found") {
    throw discoveryResult.failure.cause;
  }
  expect(
    discoveryResult.packageJsonPaths.map(filePath =>
      project.normalizePath(filePath),
    ),
  ).toEqual(["<test-root>/workspace/kept/package.json"]);
});

/**
 * Tests recursive discovery when the selected root contains a linked directory.
 * Verifies that:
 * - A real child package is discovered
 * - A package reachable only through a directory symbolic link is not followed
 * - Neither the selected project nor the link target is modified
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
  await new PromptsInteraction()
    .enterText(".")
    .submitText()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([
    "actual",
    "actual/package.json",
    "linked",
  ]);
  expect(await project.readFileAsync("actual/package.json")).toBe(
    originalPackageJson,
  );
  expect(await project.existsAsync("actual/.npmrc")).toBe(false);
  expect(await linkedProject.readTreeAsync()).toEqual(["package.json"]);
  expect(await linkedProject.readFileAsync("package.json")).toBe(
    originalPackageJson,
  );
  expect(await linkedProject.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});
