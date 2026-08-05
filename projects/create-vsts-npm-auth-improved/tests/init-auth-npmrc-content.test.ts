import { afterEach, expect, test, vi } from "vitest";
import {
  configuredPackageJsonContent,
  EXPECTED_MANAGED_NPM_CONFIG,
  parseNpmrcContent,
} from "@test-utils/configuration-fixtures";
import { runSinglePackageScenario } from "@test-utils/init-auth-scenario";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";

/**
 * Tests semantic .npmrc creation and normalization through the complete workflow.
 * Byte-level npm serialization behavior is covered only as deliberately relaxed
 * behavior in the testing documentation.
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

const promptedRegistry = "https://prompted.test/";
const existingRegistry = "https://existing.test/";
const effectiveRegistry = "https://effective.test/";

type NpmrcWorkflowScenario = {
  readonly absentKeys?: readonly string[];
  readonly description: string;
  readonly expectedValues: Readonly<Record<string, string>>;
  readonly npmrc: string | undefined;
  readonly promptForRegistry: boolean;
};

const scenarios: readonly NpmrcWorkflowScenario[] = [
  {
    description: "creates a missing project configuration",
    npmrc: undefined,
    expectedValues: {
      registry: promptedRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    },
    absentKeys: ["lockfile-version", "legacy-peer-deps"],
    promptForRegistry: true,
  },
  {
    description: "treats a scoped registry as distinct from the global registry",
    npmrc: "@scope:registry=https://scope.test/\n",
    expectedValues: {
      registry: promptedRegistry,
      "@scope:registry": "https://scope.test/",
      ...EXPECTED_MANAGED_NPM_CONFIG,
    },
    absentKeys: ["lockfile-version", "legacy-peer-deps"],
    promptForRegistry: true,
  },
  {
    description: "uses npm's effective final duplicate registry",
    npmrc: [
      "registry=https://overridden.test/",
      `registry=${effectiveRegistry}`,
      "package-lock=false",
    ].join("\n"),
    expectedValues: {
      registry: effectiveRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    },
    absentKeys: ["lockfile-version", "legacy-peer-deps"],
    promptForRegistry: false,
  },
  {
    description: "corrects managed values and preserves unrelated configuration",
    npmrc: [
      `registry=${existingRegistry}`,
      "package-lock=false",
      "lockfile-version=2",
      "legacy-peer-deps=false",
      "audit=true",
      "fund=true",
      "always-auth=true",
      "//existing.test/:always-auth=true",
      "@scope:registry=https://scope.test/",
      "//existing.test/:_authToken=secret",
      "custom-setting=value",
    ].join("\n"),
    expectedValues: {
      registry: existingRegistry,
      "@scope:registry": "https://scope.test/",
      "//existing.test/:_authToken": "secret",
      "custom-setting": "value",
      "lockfile-version": "2",
      "legacy-peer-deps": "false",
      ...EXPECTED_MANAGED_NPM_CONFIG,
    },
    absentKeys: ["always-auth", "//existing.test/:always-auth"],
    promptForRegistry: false,
  },
];

test.each(scenarios)(
  "configures .npmrc content: $description",
  async ({ description, npmrc, expectedValues, absentKeys, promptForRegistry }) => {
    const scenario = await runSinglePackageScenario({
      name: `npmrc-${description}`,
      packageJson: configuredPackageJsonContent(),
      npmrc,
      promptedRegistry: promptForRegistry ? promptedRegistry : undefined,
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([
      ".npmrc",
      "package.json",
    ]);
    expect(await scenario.project.readFileAsync("package.json")).toBe(
      configuredPackageJsonContent(),
    );
    const parsedNpmrc = parseNpmrcContent(
      await scenario.project.readFileAsync(".npmrc"),
    );
    expect(parsedNpmrc).toMatchObject(expectedValues);
    for (const key of absentKeys ?? []) {
      expect(parsedNpmrc).not.toHaveProperty(key);
    }
    expect(scenario.output.normalizedOutput).toMatchSnapshot();
  },
);
