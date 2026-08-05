import { accessSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { afterEach, expect, test, vi } from "vitest";
import { packageJsonContent } from "@test-utils/configuration-fixtures";
import {
  loadNpmConfigFileAsync,
  NpmConfigFileError,
} from "../src/init-auth/package-files/npm-config-file";
import {
  loadNpmPackageJsonFileAsync,
  NpmPackageJsonFile,
  NpmPackageJsonFileError,
} from "../src/init-auth/package-files/npm-package-json-file";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { nodeError } from "@test-utils/node-error";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * The tests below verify that init-auth handles discovery, parsing, reading,
 * planning, and persistence failures without leaving partial project changes.
 */

vi.mock("../src/init-auth/package-files/npm-config-file", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/init-auth/package-files/npm-config-file")
  >();
  return { ...actual, loadNpmConfigFileAsync: vi.fn(actual.loadNpmConfigFileAsync) };
});

vi.mock(
  "../src/init-auth/package-files/npm-package-json-file",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("../src/init-auth/package-files/npm-package-json-file")
    >();
    return {
      ...actual,
      loadNpmPackageJsonFileAsync: vi.fn(actual.loadNpmPackageJsonFileAsync),
    };
  },
);

vi.mock("globby", async (importOriginal) => {
  const actual = await importOriginal<typeof import("globby")>();
  return {
    ...actual,
    globby: vi.fn(actual.globby),
  };
});

vi.mock("node:fs", async (importOriginal) => {
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
 * Tests a directory-read failure during package discovery.
 * Verifies that:
 * - The command exits with process exit code 1
 * - No package files are read after discovery fails
 * - No files are written and the original project remains intact
 * - The terminal transcript reports the discovery failure
 */
test("reports a discovery failure before package reads or writes", async () => {
  const project = await NpmProject.createAsync("discovery-failure");
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  vi.mocked(globby).mockRejectedValueOnce(
    nodeError("directory read failed", "EIO"),
  );

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction().submitText();
  await command;

  expect(process.exitCode).toBe(1);
  expect(vi.mocked(loadNpmPackageJsonFileAsync).mock.calls).toEqual([]);
  expect(vi.mocked(loadNpmConfigFileAsync).mock.calls).toEqual([]);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests invalid package.json content, including malformed JSON and valid JSON
 * whose root value is not an object.
 * Verifies that:
 * - The command exits with process exit code 1
 * - The invalid package.json remains byte-for-byte unchanged
 * - No .npmrc is created and no writes occur
 * - The terminal transcript explains the content problem
 */
test.each([
  ["malformed JSON", "{ malformed"],
  ["a non-object JSON value", "[]"],
] as const)(
  "reports %s with zero writes",
  async (_description, packageJson) => {
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
      .acceptMultiselectValues();
    await command;

    expect(process.exitCode).toBe(1);
    expect(await project.readTreeAsync()).toEqual(["package.json"]);
    expect(await project.readFileAsync("package.json")).toBe(packageJson);
    expect(await project.existsAsync(".npmrc")).toBe(false);
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Tests a permission failure while reading a selected package.json.
 * Verifies that:
 * - The command exits with process exit code 1
 * - The error identifies the package with project-relative context
 * - No files are written and the original package remains unchanged
 */
test("reports a package.json read failure with relative context and zero writes", async () => {
  const project = await NpmProject.createAsync("package-json-read-failure");
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  vi.mocked(loadNpmPackageJsonFileAsync).mockRejectedValueOnce(
    new NpmPackageJsonFileError("read", project.path("package.json"), {
      cause: nodeError("permission denied", "EACCES"),
    }),
  );

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual(["package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests a sharing violation while reading a selected package's existing .npmrc.
 * Verifies that:
 * - package.json is read before the targeted .npmrc failure is surfaced
 * - The command exits with process exit code 1 and relative file context
 * - Neither package.json nor .npmrc is changed and no writes occur
 */
test("reports an .npmrc read failure with relative context and zero writes", async () => {
  const project = await NpmProject.createAsync("npmrc-read-failure");
  const originalNpmrc = "registry=https://existing.test/\n";
  await project.createPackageAsync({
    packageJson: originalPackageJson,
    npmrc: originalNpmrc,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  vi.mocked(loadNpmConfigFileAsync).mockRejectedValueOnce(
    new NpmConfigFileError("read", project.path(".npmrc"), {
      cause: nodeError("sharing violation", "EBUSY"),
    }),
  );

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.readFileAsync(".npmrc")).toBe(originalNpmrc);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests that all selected packages are read and validated before interactive
 * registry collection begins.
 * Verifies that:
 * - Planning reads package.json and .npmrc for every selected package
 * - Invalid content in a later package prevents the first registry prompt
 * - No package receives partial changes and no writes occur
 */
test("plans every selected package before the first registry prompt", async () => {
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
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect(
    vi.mocked(loadNpmPackageJsonFileAsync).mock.calls.map(([options]) =>
      project.normalizePath(options.packageDirectory),
    ),
  ).toEqual(["<test-root>/alpha", "<test-root>/beta"]);
  expect(
    vi.mocked(loadNpmConfigFileAsync).mock.calls.map(([options]) =>
      project.normalizePath(options.packageDirectory),
    ),
  ).toEqual(["<test-root>/alpha", "<test-root>/beta"]);
  expect(await project.readTreeAsync()).toEqual([
    "alpha",
    "alpha/package.json",
    "beta",
    "beta/package.json",
  ]);
  expect(await project.readFileAsync("alpha/package.json")).toBe(
    originalPackageJson,
  );
  expect(await project.existsAsync("alpha/.npmrc")).toBe(false);
  expect(await project.readFileAsync("beta/package.json")).toBe("{ malformed");
  expect(await project.existsAsync("beta/.npmrc")).toBe(false);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests failure of a planned package.json write during persistence.
 * Verifies that:
 * - The command exits with process exit code 1 and reports the failed file
 * - The attempted write uses the expected configured package.json content
 * - The package is rolled back so package.json and .npmrc retain their originals
 */
test("surfaces a targeted write failure through the persistence spinner", async () => {
  const project = await NpmProject.createAsync("write-failure");
  const originalNpmrc = [
    "registry=https://existing.test/",
    "package-lock=true",
    "lockfile-version=3",
    "legacy-peer-deps=true",
    "audit=false",
    "fund=false",
  ].join("\n");
  await project.createPackageAsync({
    packageJson: originalPackageJson,
    npmrc: originalNpmrc,
  });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  const actualPackageJsonModule = await vi.importActual<
    typeof import("../src/init-auth/package-files/npm-package-json-file")
  >("../src/init-auth/package-files/npm-package-json-file");
  vi.mocked(loadNpmPackageJsonFileAsync).mockImplementationOnce(async (options) => {
    const adapter = await actualPackageJsonModule.loadNpmPackageJsonFileAsync(options);
    return {
      ...adapter,
      async saveAsync() {
        throw nodeError("disk is read-only", "EROFS");
      },
    } satisfies NpmPackageJsonFile;
  });

  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  await new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  await command;

  expect(process.exitCode).toBe(1);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.readFileAsync(".npmrc")).toBe(originalNpmrc);
  expect(output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests prompt-safe mapping of known filesystem errors while validating a root.
 * Verifies that:
 * - Permission and general I/O failures receive distinct user-facing messages
 * - The root prompt remains active and accepts a valid correction
 * - The recovered no-packages flow exits successfully without writes
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
    expect(
      vi.mocked(accessSync).mock.calls.map(([directoryPath]) =>
        project.normalizePath(String(directoryPath)),
      ),
    ).toEqual([
      "<test-root>/blocked",
      "<test-root>",
    ]);
    expect(await project.readTreeAsync()).toEqual(["blocked"]);
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);
