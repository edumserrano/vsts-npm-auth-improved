import { accessSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import {
  configuredPackageJsonContent,
  packageJsonContent,
} from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { nodeError } from "@test-utils/node-error";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * These tests verify discovery, parse, read, planning, and save failures. The
 * init-auth command must not leave partial project changes.
 */

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    accessSync: vi.fn(actual.accessSync),
  };
});

const testSuiteCwd = process.cwd();
const originalPackageJson = packageJsonContent();

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

/**
 * Verifies a directory-read failure during package discovery.
 * Expected results:
 * - The command exits with process exit code 1.
 * - The command does not read package files after the discovery failure.
 * - The command does not write files, and the original project does not change.
 * - The terminal output reports the discovery failure.
 */
test("reports a discovery failure before package reads or writes", async () => {
  const project = await NpmProject.createAsync("discovery-failure");
  await project.createPackageAsync({
    directory: "workspace",
    packageJson: originalPackageJson,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  let replacedValidatedRoot = false;
  output.write.mockImplementation(chunk => {
    if (
      !replacedValidatedRoot &&
      String(chunk).includes("◇") &&
      String(chunk).includes("workspace")
    ) {
      renameSync(project.path("workspace"), project.path("workspace.original"));
      writeFileSync(project.path("workspace"), "not a directory");
      replacedValidatedRoot = true;
    }
    return true;
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().replaceText("workspace").submitText();
  await command;

  expect(process.exitCode).toBe(1);
  expect(replacedValidatedRoot).toBe(true);
  expect(await project.readTreeAsync()).toEqual([
    "workspace",
    "workspace.original",
    "workspace.original/package.json",
  ]);
  expect(await project.readFileAsync("workspace.original/package.json")).toBe(
    originalPackageJson,
  );
  expect(await project.existsAsync("workspace.original/.npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies malformed JSON and valid JSON whose root value is not an object.
 * Expected results:
 * - The command exits with process exit code 1.
 * - The invalid package.json does not change.
 * - The command does not create a .npmrc file or write other files.
 * - The terminal output explains the content problem.
 */
test.each([
  ["malformed JSON", "{ malformed"],
  ["a null JSON root", "null"],
  ["an array JSON root", "[]"],
  ["a string JSON root", '"package"'],
  ["a number JSON root", "42"],
  ["a boolean JSON root", "true"],
] as const)("reports %s with zero writes", async (_description, packageJson) => {
  const project = await NpmProject.createAsync(`invalid-${_description}`);
  await project.createPackageAsync({ packageJson });
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

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(packageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies a selected package.json that disappears or becomes unreadable after discovery.
 * Expected results:
 * - The command exits with process exit code 1.
 * - The error identifies the package with a project-relative path.
 * - The application does not write files, and the test-owned original does not change.
 */
test.each([
  ["missing", false],
  ["unreadable", true],
] as const)(
  "reports a %s package.json after discovery with zero writes",
  async (description, replaceWithDirectory) => {
    const project = await NpmProject.createAsync(`package-json-${description}`);
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
      .performAsync(async () => {
        await rename(project.path("package.json"), project.path("package.json.original"));
        if (replaceWithDirectory) {
          await mkdir(project.path("package.json"));
        }
      })
      .acceptMultiselectValues()
      .acceptSelectValue();
    await command;

    expect(process.exitCode).toBe(1);
    expect(await project.readTreeAsync()).toEqual([
      ...(replaceWithDirectory ? ["package.json"] : []),
      "package.json.original",
    ]);
    expect(await project.readFileAsync("package.json.original")).toBe(originalPackageJson);
    expect(await project.existsAsync(".npmrc")).toBe(false);
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Verifies a selected package whose existing .npmrc is not a regular file.
 * Expected results:
 * - The command reads package.json before it reports the specified .npmrc failure.
 * - The command exits with process exit code 1 and a relative file path.
 * - The command does not change package.json or .npmrc, and no writes occur.
 */
test("reports an .npmrc read failure with relative context and zero writes", async () => {
  const project = await NpmProject.createAsync("npmrc-read-failure");
  await project.createPackageAsync({
    packageJson: originalPackageJson,
  });
  await mkdir(project.path(".npmrc"));
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

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies that the command reads and validates all packages before registry collection.
 * Expected results:
 * - Planning reads package.json and .npmrc for each selected package.
 * - Invalid content in a later package prevents the first registry prompt.
 * - Packages do not receive partial changes, and no writes occur.
 */
test("rejects a later invalid package before prompting or writing", async () => {
  const project = await NpmProject.createAsync("complete-planning-failure");
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: "{ malformed",
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
    .acceptSelectValue();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([
    "alpha",
    "alpha/package.json",
    "beta",
    "beta/package.json",
  ]);
  expect(await project.readFileAsync("alpha/package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync("alpha/.npmrc")).toBe(false);
  expect(await project.readFileAsync("beta/package.json")).toBe("{ malformed");
  expect(await project.existsAsync("beta/.npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies a planned package.json write failure after planning is complete.
 * Expected results:
 * - The command exits with process exit code 1 and reports the failed file.
 * - The command does not create a .npmrc file after the package write failure.
 * - The test-owned original package content stays available for verification.
 */
test("surfaces a targeted write failure through the persistence spinner", async () => {
  const project = await NpmProject.createAsync("write-failure");
  await project.createPackageAsync({
    packageJson: originalPackageJson,
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
    .acceptSelectValue()
    .performAsync(async () => {
      await rename(project.path("package.json"), project.path("package.json.original"));
      await mkdir(project.path("package.json"));
    })
    .enterText("https://registry.example.test/")
    .submitText();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json", "package.json.original"]);
  expect(await project.readFileAsync("package.json.original")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

test("reports an .npmrc write failure after package.json is persisted", async () => {
  const project = await NpmProject.createAsync("npmrc-write-failure");
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({ temporaryRoots: [project.root] });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue()
    .performAsync(async () => {
      await mkdir(project.path(".npmrc"));
    })
    .enterText("https://registry.example.test/")
    .submitText();
  await command;

  expect(process.exitCode).toBe(1);
  expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(
    JSON.parse(configuredPackageJsonContent()),
  );
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

test("reports a later write failure after preserving earlier completed writes", async () => {
  const project = await NpmProject.createAsync("later-write-failure");
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: originalPackageJson,
  });
  const output = mockStdoutWrite({ temporaryRoots: [project.root] });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .toggleMultiselectItem()
    .acceptMultiselectValues()
    .acceptSelectValue()
    .enterText("https://alpha.example.test/")
    .submitText()
    .performAsync(async () => {
      await rename(project.path("beta/package.json"), project.path("beta/package.json.original"));
      await mkdir(project.path("beta/package.json"));
    })
    .enterText("https://beta.example.test/")
    .submitText();
  await command;

  expect(process.exitCode).toBe(1);
  expect(JSON.parse(await project.readFileAsync("alpha/package.json"))).toEqual(
    JSON.parse(configuredPackageJsonContent()),
  );
  expect(await project.readFileAsync("alpha/.npmrc")).toContain(
    "registry=https://alpha.example.test/",
  );
  expect(await project.readFileAsync("beta/package.json.original")).toBe(originalPackageJson);
  expect(await project.existsAsync("beta/.npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Verifies prompt-safe mapping of known file-system errors during root validation.
 * Expected results:
 * - Permission and general I/O failures receive different user messages.
 * - The root prompt stays active and accepts a valid correction.
 * - The recovered no-packages flow exits successfully without writes.
 */
test.each([
  ["EACCES", "inaccessible"],
  ["EIO", "I/O"],
] as const)(
  "maps a targeted %s root access failure to prompt-safe text",
  async (code, fixtureName) => {
    const project = await NpmProject.createAsync(`${fixtureName}-root`);
    await mkdir(project.path("blocked"));
    const output = mockStdoutWrite({
      temporaryRoots: [project.root],
    });
    vi.mocked(accessSync).mockImplementationOnce(() => {
      throw nodeError("test access failure", code);
    });
    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    await new PromptsInteraction()
      .replaceText("blocked")
      .submitText()
      .replaceText(".")
      .submitText();
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    expect(await project.readTreeAsync()).toEqual(["blocked"]);
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);
