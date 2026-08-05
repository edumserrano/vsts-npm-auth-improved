import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadNpmConfigFileAsync } from "../src/init-auth/package-files/npm-config-file";
import { NpmProject } from "@test-utils/npm-project";

type IsolatedConfigLocations = {
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly globalConfigPath: string;
  readonly globalConfigText: string;
  readonly userConfigPath: string;
  readonly userConfigText: string;
};

const CORRECT_MANAGED_CONFIG = [
  "package-lock=true",
  "audit=false",
  "fund=false",
].join("\n");

afterEach(async () => {
  await NpmProject.cleanupAllAsync();
});

test.each([
  {
    existed: false,
    expectedEffectiveRegistry: "https://user-sentinel.example/",
    initialNpmrc: undefined,
    expectedDisposition: "created",
    label: "missing file",
  },
  {
    existed: true,
    expectedEffectiveRegistry: "https://user-sentinel.example/",
    initialNpmrc: "",
    expectedDisposition: "updated",
    label: "empty file",
  },
  {
    existed: true,
    expectedEffectiveRegistry: undefined,
    initialNpmrc: "registry=   \n",
    expectedDisposition: "updated",
    label: "empty registry",
  },
] as const)(
  "configures a project with a $label without touching inherited files",
  async ({ existed, expectedEffectiveRegistry, initialNpmrc, expectedDisposition, label }) => {
    const project = await NpmProject.createAsync(`initial-${label}`);
    await project.createPackageAsync({
      ...(initialNpmrc === undefined ? {} : { npmrc: initialNpmrc }),
      packageJson: JSON.stringify({ name: `initial-${existed}` }),
    });
    const isolated = await createIsolatedConfigLocationsAsync(project);

    const adapter = await loadNpmConfigFileAsync({
      env: isolated.env,
      packageDirectory: project.root,
    });

    expect(adapter).toMatchObject({
      disposition: expectedDisposition,
      effectiveRegistry: expectedEffectiveRegistry,
      existed,
      filePath: project.path(".npmrc"),
      localPrefix: project.root,
      projectRegistry: undefined,
    });
    expect(await project.existsAsync(".npmrc")).toBe(existed);

    adapter.setPromptedRegistry("https://prompted.example/");
    await adapter.saveAsync();

    const content = await project.readFileAsync(".npmrc");
    expect(content).toContain("registry=https://prompted.example/");
    expectManagedConfig(content);
    expect(content).not.toContain("lockfile-version=");
    expect(content).not.toContain("legacy-peer-deps=");
    await expectInheritedConfigsUnchangedAsync(project, isolated);
  },
);

test.each([
  {
    argv: [] as readonly string[],
    expected: "https://global.example/",
    globalConfigText: "registry=https://global.example/\n",
    label: "global",
    userConfigText: "color=false\n",
  },
  {
    argv: [] as readonly string[],
    expected: "https://user.example/",
    globalConfigText: "registry=https://global.example/\n",
    label: "user",
    userConfigText: "registry=https://user.example/\n",
  },
  {
    argv: [] as readonly string[],
    envRegistry: "https://environment.example/",
    expected: "https://environment.example/",
    globalConfigText: "registry=https://global.example/\n",
    label: "environment",
    userConfigText: "registry=https://user.example/\n",
  },
  {
    argv: ["--registry=https://cli.example/"] as readonly string[],
    envRegistry: "https://environment.example/",
    expected: "https://cli.example/",
    globalConfigText: "registry=https://global.example/\n",
    label: "CLI",
    userConfigText: "registry=https://user.example/\n",
  },
])(
  "exposes an inherited $label registry without treating it as project-level",
  async ({ argv, envRegistry, expected, globalConfigText, userConfigText }) => {
    const project = await NpmProject.createAsync(`inherited-${expected}`);
    await project.createPackageAsync({
      packageJson: JSON.stringify({ name: "inherited-registry" }),
    });
    const isolated = await createIsolatedConfigLocationsAsync(project, userConfigText, globalConfigText);

    const adapter = await loadNpmConfigFileAsync({
      argv,
      env: {
        ...isolated.env,
        ...(envRegistry === undefined ? {} : { npm_config_registry: envRegistry }),
      },
      packageDirectory: project.root,
    });

    expect(adapter.effectiveRegistry).toBe(expected);
    expect(adapter.projectRegistry).toBeUndefined();
    expect(adapter.disposition).toBe("created");
    expect(await project.existsAsync(".npmrc")).toBe(false);
  },
);

test("does not count a scoped registry as the project registry", async () => {
  const project = await NpmProject.createAsync("scoped-only-registry");
  await project.createPackageAsync({
    npmrc: "@example:registry=https://scoped.example/\n",
    packageJson: JSON.stringify({ name: "scoped-only-registry" }),
  });
  const isolated = await createIsolatedConfigLocationsAsync(project);

  const adapter = await loadNpmConfigFileAsync({
    env: isolated.env,
    packageDirectory: project.root,
  });

  expect(adapter.projectRegistry).toBeUndefined();
  expect(adapter.effectiveRegistry).toBe("https://user-sentinel.example/");
  adapter.setPromptedRegistry("https://prompted.example/");
  await adapter.saveAsync();
  expect(await project.readFileAsync(".npmrc")).toContain(
    "@example:registry=https://scoped.example/",
  );
});

test("uses npm's effective final duplicate project registry", async () => {
  const project = await NpmProject.createAsync("duplicate-registry");
  await project.createPackageAsync({
    npmrc: [
      "registry=https://overridden.example/",
      "registry=https://effective.example/",
      "package-lock=false",
      "# audit=true is only a comment",
      CORRECT_MANAGED_CONFIG,
      "",
    ].join("\n"),
    packageJson: JSON.stringify({ name: "duplicate-registry" }),
  });
  const isolated = await createIsolatedConfigLocationsAsync(project);
  const originalContent = await project.readFileAsync(".npmrc");

  const adapter = await loadNpmConfigFileAsync({
    env: isolated.env,
    packageDirectory: project.root,
  });

  expect(adapter.projectRegistry).toBe("https://effective.example/");
  expect(adapter.effectiveRegistry).toBe("https://effective.example/");
  expect(adapter.disposition).toBe("unchanged");
  expect(await project.readFileAsync(".npmrc")).toBe(originalContent);
});

test("corrects managed values while preserving registries, credentials, and unmanaged settings", async () => {
  const project = await NpmProject.createAsync("managed-values");
  await project.createPackageAsync({
    npmrc: [
      "registry=https://project.example/",
      "package-lock=false",
      "lockfile-version=2",
      "legacy-peer-deps=false",
      "audit=true",
      "fund=true",
      "always-auth=true",
      "//pkgs.example/:always-auth=true",
      "@example:registry=https://scoped.example/",
      "//pkgs.example/:_authToken=secret-token",
      "color=false",
      "",
    ].join("\n"),
    packageJson: JSON.stringify({ name: "managed-values" }),
  });
  const isolated = await createIsolatedConfigLocationsAsync(project);

  const adapter = await loadNpmConfigFileAsync({
    env: isolated.env,
    packageDirectory: project.root,
  });
  adapter.setPromptedRegistry("https://must-not-replace.example/");
  expect(adapter.projectRegistry).toBe("https://project.example/");
  expect(adapter.disposition).toBe("updated");
  await adapter.saveAsync();

  const content = await project.readFileAsync(".npmrc");
  expect(content).toContain("registry=https://project.example/");
  expect(content).not.toContain("must-not-replace");
  expectManagedConfig(content);
  expect(content).toContain("lockfile-version=2");
  expect(content).toContain("legacy-peer-deps=false");
  expect(content.toLowerCase()).not.toContain("always-auth");
  expect(content).toContain("@example:registry=https://scoped.example/");
  expect(content).toContain("//pkgs.example/:_authToken=secret-token");
  expect(content).toContain("color=false");
  await expectInheritedConfigsUnchangedAsync(project, isolated);

  const secondRun = await loadNpmConfigFileAsync({
    env: isolated.env,
    packageDirectory: project.root,
  });
  expect(secondRun.disposition).toBe("unchanged");
  expect(secondRun.projectRegistry).toBe("https://project.example/");
  expect(await project.readFileAsync(".npmrc")).toBe(content);
});

test.each([
  {
    label: "standalone",
    packageDirectory: "",
    rootPackageJson: { name: "standalone" },
    targetNpmrc: "registry=https://standalone.example/\n",
  },
  {
    label: "nested",
    packageDirectory: "packages/nested",
    rootPackageJson: { name: "nested-root" },
    targetNpmrc: "registry=https://nested.example/\n",
  },
  {
    label: "workspace member",
    packageDirectory: "packages/member",
    rootPackageJson: {
      name: "workspace-root",
      private: true,
      workspaces: ["packages/*"],
    },
    targetNpmrc: "registry=https://workspace-member.example/\n",
  },
])("targets the $label package's adjacent .npmrc", async scenario => {
  const project = await NpmProject.createAsync(`target-${scenario.label}`);
  const rootNpmrc = "registry=https://root.example/\ncolor=true\n";
  await project.createPackageAsync({
    npmrc: scenario.packageDirectory === "" ? scenario.targetNpmrc : rootNpmrc,
    packageJson: JSON.stringify(scenario.rootPackageJson),
  });
  if (scenario.packageDirectory !== "") {
    await project.createPackageAsync({
      directory: scenario.packageDirectory,
      npmrc: scenario.targetNpmrc,
      packageJson: JSON.stringify({ name: `target-${scenario.label}` }),
    });
  }
  const isolated = await createIsolatedConfigLocationsAsync(project);
  const packageDirectory = project.path(scenario.packageDirectory);

  const adapter = await loadNpmConfigFileAsync({
    env: isolated.env,
    packageDirectory,
  });
  await adapter.saveAsync();

  expect(adapter.filePath).toBe(path.join(packageDirectory, ".npmrc"));
  expect(adapter.localPrefix).toBe(packageDirectory);
  expectManagedConfig(await project.readFileAsync(path.join(scenario.packageDirectory, ".npmrc")));
  if (scenario.packageDirectory !== "") {
    expect(await project.readFileAsync(".npmrc")).toBe(rootNpmrc);
  }
  await expectInheritedConfigsUnchangedAsync(project, isolated);
});

async function createIsolatedConfigLocationsAsync(
  project: NpmProject,
  userConfigText = "registry=https://user-sentinel.example/\n",
  globalConfigText = "registry=https://global-sentinel.example/\n",
): Promise<IsolatedConfigLocations> {
  const userConfigPath = project.path("config/user.npmrc");
  const globalConfigPath = project.path("config/global.npmrc");
  await project.writeFileAsync("config/user.npmrc", userConfigText);
  await project.writeFileAsync("config/global.npmrc", globalConfigText);

  return {
    env: {
      HOME: project.path("home"),
      USERPROFILE: project.path("home"),
      npm_config_globalconfig: globalConfigPath,
      npm_config_userconfig: userConfigPath,
    },
    globalConfigPath,
    globalConfigText,
    userConfigPath,
    userConfigText,
  };
}

function expectManagedConfig(content: string): void {
  for (const setting of CORRECT_MANAGED_CONFIG.split("\n")) {
    expect(content).toContain(setting);
  }
}

async function expectInheritedConfigsUnchangedAsync(
  project: NpmProject,
  isolated: IsolatedConfigLocations,
): Promise<void> {
  expect(await project.readFileAsync(path.relative(project.root, isolated.userConfigPath))).toBe(
    isolated.userConfigText,
  );
  expect(await project.readFileAsync(path.relative(project.root, isolated.globalConfigPath))).toBe(
    isolated.globalConfigText,
  );
}
