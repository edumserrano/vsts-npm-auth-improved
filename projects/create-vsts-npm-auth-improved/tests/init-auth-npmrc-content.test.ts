import { afterEach, expect, test, vi } from "vitest";
import {
  configuredPackageJsonContent,
  EXPECTED_MANAGED_NPM_CONFIG,
  parseNpmrcContent,
} from "@test-utils/configuration-fixtures";
import { InitAuthCommand } from "@test-utils/init-auth-command";
import { runSinglePackageScenarioAsync } from "@test-utils/init-auth-scenario";
import { NpmProject } from "@test-utils/npm-project";
import { PromptsInteraction } from "@test-utils/prompts-interaction";
import { mockStdoutWrite } from "@test-utils/process-output";

/**
 * Tests semantic .npmrc creation and normalization through the complete workflow.
 * Byte-level npm serialization behavior is covered only as deliberately relaxed
 * behavior in the testing documentation.
 */

const testSuiteCwd = process.cwd();
const controlledEnvironmentKeys = [
  "HOME",
  "USERPROFILE",
  "npm_config_globalconfig",
  "npm_config_registry",
  "npm_config_userconfig",
] as const;
const originalEnvironment = new Map(controlledEnvironmentKeys.map(key => [key, process.env[key]]));

afterEach(async () => {
  process.chdir(testSuiteCwd);
  restoreControlledEnvironment();
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
    description: "updates an empty project configuration",
    npmrc: "",
    expectedValues: {
      registry: promptedRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    },
    absentKeys: ["lockfile-version", "legacy-peer-deps"],
    promptForRegistry: true,
  },
  {
    description: "replaces a whitespace-only project registry",
    npmrc: "registry=   \n",
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

/**
 * Tests managed .npmrc settings across existing configuration shapes.
 * Verifies that required values are normalized while unrelated settings are preserved.
 */
test.each(scenarios)(
  "configures .npmrc content: $description",
  async ({ description, npmrc, expectedValues, absentKeys, promptForRegistry }) => {
    const scenario = await runSinglePackageScenarioAsync({
      name: `npmrc-${description}`,
      packageJson: configuredPackageJsonContent(),
      npmrc,
      promptedRegistry: promptForRegistry ? promptedRegistry : undefined,
    });

    expect(process.exitCode ?? 0).toBe(0);
    expect(await scenario.project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
    expect(await scenario.project.readFileAsync("package.json")).toBe(
      configuredPackageJsonContent(),
    );
    const parsedNpmrc = parseNpmrcContent(await scenario.project.readFileAsync(".npmrc"));
    expect(parsedNpmrc).toMatchObject(expectedValues);
    for (const key of absentKeys ?? []) {
      expect(parsedNpmrc).not.toHaveProperty(key);
    }
    expect(scenario.output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Tests registry selection when npm provides an inherited registry.
 * Verifies that a project registry is still requested and written without changing inherited files.
 */
test.each([
  {
    description: "global registry",
    globalConfig: "registry=https://global.example.test/\n",
    userConfig: "color=false\n",
  },
  {
    description: "user registry",
    globalConfig: "registry=https://global.example.test/\n",
    userConfig: "registry=https://user.example.test/\n",
  },
  {
    description: "environment registry",
    environmentRegistry: "https://environment.example.test/",
    globalConfig: "registry=https://global.example.test/\n",
    userConfig: "registry=https://user.example.test/\n",
  },
] as const)(
  "prompts for a project registry despite an inherited $description",
  async ({ description, environmentRegistry, globalConfig, userConfig }) => {
    const project = await NpmProject.createAsync(`inherited-${description}`);
    await project.createPackageAsync({
      packageJson: configuredPackageJsonContent(),
    });
    await project.writeFileAsync("config/global.npmrc", globalConfig);
    await project.writeFileAsync("config/user.npmrc", userConfig);
    configureNpmEnvironment(project, environmentRegistry);
    const output = mockStdoutWrite({ temporaryRoots: [project.root] });

    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    await new PromptsInteraction()
      .submitText()
      .down()
      .toggleMultiselectItem()
      .acceptMultiselectValues()
      .enterText(promptedRegistry)
      .submitText();
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    expect(parseNpmrcContent(await project.readFileAsync(".npmrc"))).toMatchObject({
      registry: promptedRegistry,
      ...EXPECTED_MANAGED_NPM_CONFIG,
    });
    expect(await project.readFileAsync("config/global.npmrc")).toBe(globalConfig);
    expect(await project.readFileAsync("config/user.npmrc")).toBe(userConfig);
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

/**
 * Tests .npmrc placement for standalone, nested, and workspace packages.
 * Verifies that only the configuration adjacent to the selected package is updated.
 */
test.each([
  {
    description: "standalone package",
    packageDirectory: "",
    rootPackageJson: { name: "standalone" },
  },
  {
    description: "nested package",
    packageDirectory: "packages/nested",
    rootPackageJson: { name: "nested-root" },
  },
  {
    description: "workspace member",
    packageDirectory: "packages/member",
    rootPackageJson: {
      name: "workspace-root",
      private: true,
      workspaces: ["packages/*"],
    },
  },
] as const)(
  "updates only the $description adjacent .npmrc",
  async ({ description, packageDirectory, rootPackageJson }) => {
    const project = await NpmProject.createAsync(`adjacent-${description}`);
    const rootNpmrc = "registry=https://root.example.test/\ncolor=true\n";
    const targetNpmrc = "registry=https://target.example.test/\n";
    await project.createPackageAsync({
      npmrc: packageDirectory === "" ? targetNpmrc : rootNpmrc,
      packageJson: JSON.stringify(rootPackageJson),
    });
    if (packageDirectory !== "") {
      await project.createPackageAsync({
        directory: packageDirectory,
        npmrc: targetNpmrc,
        packageJson: configuredPackageJsonContent(),
      });
    }
    const output = mockStdoutWrite({ temporaryRoots: [project.root] });

    process.chdir(project.root);
    const command = InitAuthCommand.invokeAsync();
    const interaction = new PromptsInteraction().submitText().down();
    if (packageDirectory !== "") {
      interaction.down();
    }
    await interaction.toggleMultiselectItem().acceptMultiselectValues();
    await command;

    expect(process.exitCode ?? 0).toBe(0);
    const targetPath = packageDirectory === "" ? ".npmrc" : `${packageDirectory}/.npmrc`;
    expect(parseNpmrcContent(await project.readFileAsync(targetPath))).toMatchObject({
      registry: "https://target.example.test/",
      ...EXPECTED_MANAGED_NPM_CONFIG,
    });
    if (packageDirectory !== "") {
      expect(await project.readFileAsync(".npmrc")).toBe(rootNpmrc);
    }
    expect(output.normalizedOutput).toMatchSnapshot();
  },
);

function configureNpmEnvironment(project: NpmProject, registry: string | undefined): void {
  process.env["HOME"] = project.path("home");
  process.env["USERPROFILE"] = project.path("home");
  process.env["npm_config_globalconfig"] = project.path("config/global.npmrc");
  process.env["npm_config_userconfig"] = project.path("config/user.npmrc");
  if (registry === undefined) {
    delete process.env["npm_config_registry"];
  } else {
    process.env["npm_config_registry"] = registry;
  }
}

function restoreControlledEnvironment(): void {
  for (const key of controlledEnvironmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
