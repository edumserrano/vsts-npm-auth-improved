import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  loadNpmConfigFile,
  NpmConfigFile,
} from "../src/init-auth/package-files/npm-config-file";
import {
  loadNpmPackageJsonFile,
  NpmPackageJsonFile,
} from "../src/init-auth/package-files/npm-package-json-file";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

vi.mock("../src/init-auth/package-files/npm-config-file", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/init-auth/package-files/npm-config-file")
  >();
  return { ...actual, loadNpmConfigFile: vi.fn() };
});

vi.mock(
  "../src/init-auth/package-files/npm-package-json-file",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../src/init-auth/package-files/npm-package-json-file")
    >();
    return { ...actual, loadNpmPackageJsonFile: vi.fn() };
  },
);

const testSuiteCwd = process.cwd();

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

test("reports a later rejected adapter save as potentially partial", async () => {
  const project = await NpmProject.createAsync("later-adapter-save-failure");
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: JSON.stringify({ name: "alpha" }),
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: JSON.stringify({ name: "beta" }),
  });
  const output = mockStdoutWrite({ temporaryRoots: [project.root] });
  const saves: string[] = [];
  const failure = new Error("disk full");

  vi.mocked(loadNpmPackageJsonFile).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    return {
      disposition: "updated",
      filePath: path.join(packageDirectory, "package.json"),
      save: vi.fn(async () => {
        saves.push(`${name}/package.json`);
        if (name === "beta") {
          throw failure;
        }
      }),
    } satisfies NpmPackageJsonFile;
  });
  vi.mocked(loadNpmConfigFile).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    return {
      argv: [],
      disposition: "updated",
      effectiveRegistry: "https://project.example/",
      existed: true,
      filePath: path.join(packageDirectory, ".npmrc"),
      localPrefix: packageDirectory,
      projectRegistry: "https://project.example/",
      save: vi.fn(async () => {
        saves.push(`${name}/.npmrc`);
      }),
      setPromptedRegistry: vi.fn(),
    } satisfies NpmConfigFile;
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .enterText(".")
    .submitText()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect(saves).toEqual([
    "alpha/package.json",
    "alpha/.npmrc",
    "beta/package.json",
  ]);
  expect(output.normalizedOutput).toContain(
    "Could not write beta/package.json: disk full.",
  );
  expect(output.normalizedOutput).toContain(
    "Operation failed. Configuration may be partially applied.",
  );
});
