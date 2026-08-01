import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * The tests below verify the built create package through its emitted public API
 * and npm executable entrypoint rather than the source-level command helpers.
 */

type EmittedCliAsync = (argv: readonly string[]) => Promise<void>;

type EmittedCreatePackage = {
  readonly invokeAsync: (args?: readonly string[]) => Promise<void>;
  readonly outputRoot: string;
  readonly packageRoot: string;
};

const testSuiteCwd = process.cwd();

afterEach(async () => {
  process.chdir(testSuiteCwd);
  PromptsInteraction.resetPromptListeners();
  process.exitCode = undefined;
  await NpmProject.cleanupAllAsync();
});

/**
 * Tests that the compiled and publish-cleaned package exposes a working CLI and
 * points its npm bin declaration at an emitted file.
 * Verifies that:
 * - The package builds and its declared executable exists in the output
 * - The emitted cliAsync export runs the explicit init-auth workflow
 * - A project with no packages exits successfully without filesystem changes
 * - The emitted-package terminal transcript matches the expected no-packages flow
 *
 * CLI command represented by the emitted API call:
 * - create-vsts-npm-auth-improved init-auth
 */
test("runs the no-packages flow through the emitted package entrypoint", async () => {
  const emittedPackage = await buildAndLoadEmittedCreatePackageAsync();
  const sourcePackageJson = JSON.parse(
    await readFile(
      path.join(emittedPackage.packageRoot, "package.json"),
      "utf8",
    ),
  ) as { readonly bin?: unknown };
  const binTarget = resolveBinTarget(sourcePackageJson.bin);
  await expect(
    access(path.resolve(emittedPackage.outputRoot, binTarget)),
  ).resolves.toBeUndefined();

  const project = await NpmProject.createAsync("emitted-no-packages");
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });

  process.chdir(project.root);
  const command = emittedPackage.invokeAsync(["init-auth"]);
  await new PromptsInteraction().enterText("./").submitText();
  await command;

  expect(process.exitCode ?? 0).toBe(0);
  expect(await project.readTreeAsync()).toEqual([]);
  expect(output.normalizedOutput).toMatchSnapshot();
});

async function buildAndLoadEmittedCreatePackageAsync(): Promise<EmittedCreatePackage> {
  const packageRoot = path.resolve(__dirname, "..");
  const outputRoot = path.join(
    packageRoot,
    "dist",
    "create-vsts-npm-auth-improved",
  );
  await rm(outputRoot, { recursive: true, force: true });

  const tscPath = path.join(
    packageRoot,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  execFileSync(process.execPath, [tscPath, "-p", "tsconfig.lib.json"], {
    cwd: packageRoot,
    stdio: "pipe",
  });

  const clearPackageJsonPath = path.join(
    packageRoot,
    "node_modules",
    "clean-publish",
    "clear-package-json.js",
  );
  execFileSync(
    process.execPath,
    [
      clearPackageJsonPath,
      "package.json",
      "-o",
      path.join(outputRoot, "package.json"),
    ],
    {
      cwd: packageRoot,
      stdio: "pipe",
    },
  );

  const emittedPublicApi = createRequire(__filename)(
    path.join(outputRoot, "cjs", "public-api.js"),
  ) as { readonly cliAsync?: unknown };
  if (typeof emittedPublicApi.cliAsync !== "function") {
    throw new TypeError(
      "The emitted create package does not export a cliAsync function.",
    );
  }

  const cliAsync = emittedPublicApi.cliAsync as EmittedCliAsync;
  return {
    invokeAsync(args = []) {
      return cliAsync(["node", "main.js", ...args]);
    },
    outputRoot,
    packageRoot,
  };
}

function resolveBinTarget(bin: unknown): string {
  if (typeof bin === "string") {
    return bin;
  }
  if (typeof bin === "object" && bin !== null) {
    const targets = Object.values(bin);
    if (targets.length === 1 && typeof targets[0] === "string") {
      return targets[0];
    }
  }
  throw new TypeError("Expected package.json to declare exactly one npm bin target.");
}
