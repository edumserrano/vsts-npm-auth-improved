import { afterEach, expect, test, vi } from "vitest";
import { canonicalNpmrc } from "@test-utils/configuration-fixtures";
import { runSinglePackageScenario } from "@test-utils/init-auth-scenario";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * Tests the semantic package.json content produced by the init-auth workflow.
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

const existingRegistry = "https://existing.test/";

const managedScripts = {
  "registry-auth": "vsts-npm-auth-improved -c ./.npmrc --read",
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

/**
 * Tests how init-auth adds its managed package.json scripts and development
 * dependency across different existing document shapes.
 * Verifies that:
 * - Managed fields are created or corrected as required
 * - Unrelated package metadata, dependencies, and scripts are preserved
 * - Invalid supported containers are replaced
 * - The already-correct .npmrc is not rewritten
 */
test.each([
  [
    "creates managed scripts and the development dependency",
    JSON.stringify({ name: "example" }, undefined, 2),
    {
      name: "example",
      scripts: managedScripts,
      devDependencies: { "vsts-npm-auth-improved": "^1.0.0" },
    },
  ],
  [
    "replaces non-object script and dependency containers",
    '{"name":"example","scripts":["old"],"devDependencies":"old"}',
    {
      name: "example",
      scripts: managedScripts,
      devDependencies: { "vsts-npm-auth-improved": "^1.0.0" },
    },
  ],
  [
    "overwrites conflicts while preserving unrelated fields dependencies and scripts",
    JSON.stringify({
      name: "preserved",
      private: true,
      scripts: {
        test: "vitest",
        "install-packages": "wrong install",
        lint: "eslint .",
        "registry-auth": "wrong auth",
        "preinstall-packages": "wrong preinstall",
      },
      dependencies: {
        lodash: "^4.17.21",
      },
      custom: {
        nested: true,
      },
    }),
    {
      name: "preserved",
      private: true,
      scripts: { ...managedScripts, test: "vitest", lint: "eslint ." },
      dependencies: { lodash: "^4.17.21" },
      custom: { nested: true },
      devDependencies: { "vsts-npm-auth-improved": "^1.0.0" },
    },
  ],
] as const)(
  "configures package.json content: %s",
  async (_description, packageJson, expectedPackageJson) => {
    const scenario = await runSinglePackageScenario({
      name: `package-json-${_description}`,
      packageJson,
      npmrc: canonicalNpmrc(existingRegistry),
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([
      ".npmrc",
      "package.json",
    ]);
    expect(JSON.parse(await scenario.project.readFileAsync("package.json"))).toEqual(
      expectedPackageJson,
    );
    expect(await scenario.project.readFileAsync(".npmrc")).toBe(
      canonicalNpmrc(existingRegistry),
    );
    expect(scenario.output.normalizedOutput).toMatchSnapshot();
  },
);
