import { afterEach, expect, test, vi } from "vitest";
import { canonicalNpmrc, packageJsonContent } from "@test-utils/configuration-fixtures";
import { runSinglePackageScenarioAsync } from "@test-utils/init-auth-scenario";
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
  "registry-auth":
    "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force",
  preinstall: "npm run registry-auth",
} as const;

const customInstallManagedScripts = {
  "registry-auth": managedScripts["registry-auth"],
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
      devDependencies: { "vsts-npm-auth-improved": "latest" },
    },
  ],
  [
    "replaces non-object script and dependency containers",
    '{"name":"example","scripts":["old"],"devDependencies":"old"}',
    {
      name: "example",
      scripts: managedScripts,
      devDependencies: { "vsts-npm-auth-improved": "latest" },
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
        preinstall: "npm run existing-preinstall",
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
      scripts: {
        ...managedScripts,
        preinstall: "npm run registry-auth && npm run existing-preinstall",
        test: "vitest",
        "install-packages": "wrong install",
        lint: "eslint .",
        "preinstall-packages": "wrong preinstall",
      },
      dependencies: { lodash: "^4.17.21" },
      custom: { nested: true },
      devDependencies: { "vsts-npm-auth-improved": "latest" },
    },
  ],
  [
    "preserves and reconciles every dependency section",
    `\uFEFF${JSON.stringify({
      name: "all-dependency-types",
      scripts: { test: "vitest" },
      dependencies: { zebra: "1", sharedOptional: "2", alpha: "3" },
      devDependencies: { zebraDev: "4", alphaDev: "5" },
      optionalDependencies: { sharedOptional: "6", alphaOptional: "7" },
      peerDependencies: { zebraPeer: "8", alphaPeer: "9" },
    })}`,
    {
      name: "all-dependency-types",
      scripts: { ...managedScripts, test: "vitest" },
      dependencies: { alpha: "3", zebra: "1" },
      devDependencies: {
        alphaDev: "5",
        "vsts-npm-auth-improved": "latest",
        zebraDev: "4",
      },
      optionalDependencies: { alphaOptional: "7", sharedOptional: "6" },
      peerDependencies: { alphaPeer: "9", zebraPeer: "8" },
    },
  ],
  [
    "discards invalid managed entries while preserving valid entries",
    JSON.stringify({
      name: "invalid-managed-entries",
      scripts: { test: "vitest", invalid: true },
      devDependencies: { typescript: "7", invalid: false },
    }),
    {
      name: "invalid-managed-entries",
      scripts: { ...managedScripts, test: "vitest" },
      devDependencies: {
        typescript: "7",
        "vsts-npm-auth-improved": "latest",
      },
    },
  ],
] as const)(
  "configures package.json content: %s",
  async (_description, packageJson, expectedPackageJson) => {
    const scenario = await runSinglePackageScenarioAsync({
      name: `package-json-${_description}`,
      packageJson,
      npmrc: canonicalNpmrc(existingRegistry),
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
    expect(JSON.parse(await scenario.project.readFileAsync("package.json"))).toEqual(
      expectedPackageJson,
    );
    expect(await scenario.project.readFileAsync(".npmrc")).toBe(canonicalNpmrc(existingRegistry));
    expect(scenario.output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Tests selecting the custom install-packages compatibility strategy.
 * Verifies that its managed scripts are created while unrelated scripts are preserved.
 */
test("creates the custom install-packages compatibility scripts when selected", async () => {
  const scenario = await runSinglePackageScenarioAsync({
    name: "package-json-custom-install-packages",
    packageJson: packageJsonContent({ scripts: { test: "vitest" } }),
    npmrc: canonicalNpmrc(existingRegistry),
    packageInstallationStrategy: "custom-install-packages",
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(JSON.parse(await scenario.project.readFileAsync("package.json"))).toEqual({
    name: "test-package",
    scripts: { ...customInstallManagedScripts, test: "vitest" },
    devDependencies: { "vsts-npm-auth-improved": "latest" },
  });
  expect(scenario.output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests changing from custom install-packages scripts to the standard npm install strategy.
 * Verifies that stale hooks are replaced while existing preinstall work remains chained.
 */
test("switches from custom install scripts to standard npm install without stale hooks", async () => {
  const scenario = await runSinglePackageScenarioAsync({
    name: "package-json-custom-to-standard",
    packageJson: packageJsonContent({
      scripts: {
        ...customInstallManagedScripts,
        preinstall: "npm run existing-preinstall",
      },
    }),
    npmrc: canonicalNpmrc(existingRegistry),
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(JSON.parse(await scenario.project.readFileAsync("package.json"))).toEqual({
    name: "test-package",
    scripts: {
      ...managedScripts,
      preinstall: "npm run registry-auth && npm run existing-preinstall",
    },
    devDependencies: { "vsts-npm-auth-improved": "latest" },
  });
  expect(scenario.output.normalizedOutput).toMatchSnapshot();
});

/**
 * Tests changing from standard npm install scripts to the custom compatibility strategy.
 * Verifies that managed hooks are replaced and existing preinstall work is restored.
 */
test("switches to custom install scripts and restores chained preinstall work", async () => {
  const scenario = await runSinglePackageScenarioAsync({
    name: "package-json-standard-to-custom",
    packageJson: packageJsonContent({
      scripts: {
        ...managedScripts,
        preinstall: "npm run registry-auth && npm run existing-preinstall",
      },
    }),
    npmrc: canonicalNpmrc(existingRegistry),
    packageInstallationStrategy: "custom-install-packages",
  });

  expect(process.exitCode ?? 0).toBe(0);
  expect(JSON.parse(await scenario.project.readFileAsync("package.json"))).toEqual({
    name: "test-package",
    scripts: {
      ...customInstallManagedScripts,
      preinstall: "npm run existing-preinstall",
    },
    devDependencies: { "vsts-npm-auth-improved": "latest" },
  });
  expect(scenario.output.normalizedOutput).toMatchSnapshot();
});
