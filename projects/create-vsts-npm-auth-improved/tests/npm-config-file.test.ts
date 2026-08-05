import path from "node:path";
import { expect, test } from "vitest";
import {
  loadNpmConfigFileWithDependencies,
  NpmConfigFileError,
} from "../src/init-auth/package-files/npm-config-file";

type TestDependencies = Parameters<typeof loadNpmConfigFileWithDependencies>[1];

type ConfigCall = {
  readonly key: string;
  readonly where: "project";
};

type SetCall = ConfigCall & {
  readonly value: unknown;
};

class FakeConfig {
  public static effectiveValues: Readonly<Record<string, unknown>> = {};
  public static latest: FakeConfig | undefined;
  public static loadFailure: unknown;
  public static projectValues: Readonly<Record<string, unknown>> = {};
  public static rawProjectValues: Readonly<Record<string, unknown>> = {};
  public static saveFailure: unknown;

  public readonly argv: readonly string[];
  public readonly data: {
    get(where: "project"): { readonly raw: Readonly<Record<string, unknown>> };
  };
  public readonly deleteCalls: ConfigCall[] = [];
  public readonly localPrefix: string;
  public readonly options: Readonly<Record<string, unknown>>;
  public readonly setCalls: SetCall[] = [];
  public loadCalls = 0;
  public saveCalls = 0;

  public constructor(options: Readonly<Record<string, unknown>>) {
    this.options = options;
    this.argv = readStringArray(options["argv"]);
    this.localPrefix = readString(options["cwd"]);
    this.data = {
      get: () => ({ raw: Object.freeze({ ...FakeConfig.rawProjectValues }) }),
    };
    FakeConfig.latest = this;
  }

  public delete(key: string, where: "project"): void {
    this.deleteCalls.push({ key, where });
  }

  public get(key: string, where?: "project"): unknown {
    return where === "project" ? FakeConfig.projectValues[key] : FakeConfig.effectiveValues[key];
  }

  public async load(): Promise<void> {
    this.loadCalls += 1;
    if (FakeConfig.loadFailure !== undefined) {
      throw FakeConfig.loadFailure;
    }
  }

  public async save(where: "project"): Promise<void> {
    expect(where).toBe("project");
    this.saveCalls += 1;
    if (FakeConfig.saveFailure !== undefined) {
      throw FakeConfig.saveFailure;
    }
  }

  public set(key: string, value: unknown, where: "project"): void {
    this.setCalls.push({ key, value, where });
  }
}

test("constructs a controlled package-local config and performs only required semantic calls", async () => {
  resetFakeConfig({
    effectiveValues: { registry: "https://cli.example/" },
    projectValues: {
      registry: " https://project.example/ ",
      "package-lock": true,
      "lockfile-version": 2,
      "legacy-peer-deps": true,
      audit: true,
      fund: false,
    },
    rawProjectValues: Object.freeze({
      registry: "https://project.example/",
      "always-auth": true,
      "//pkgs.example/:always-auth": true,
      "//pkgs.example/:_authToken": "secret",
    }),
  });
  const environment = { npm_config_registry: "https://environment.example/" };
  const packageDirectory = path.resolve("fixtures", "package");
  const npmPath = path.resolve("fixtures", "npm-runtime");

  const adapter = await loadNpmConfigFileWithDependencies(
    {
      argv: ["--registry=https://cli.example/", "--prefix=ignored"],
      env: environment,
      npmPath,
      packageDirectory,
    },
    createDependencies(true),
  );

  const config = requireLatestConfig();
  expect(config.loadCalls).toBe(1);
  expect(config.saveCalls).toBe(0);
  expect(config.options).toMatchObject({
    argv: [
      "node",
      "create-vsts-npm-auth-improved",
      "--registry=https://cli.example/",
      "--prefix=ignored",
      "--prefix",
      packageDirectory,
    ],
    cwd: packageDirectory,
    env: environment,
    npmPath,
    warn: false,
  });
  expect(adapter).toMatchObject({
    disposition: "updated",
    effectiveRegistry: "https://cli.example/",
    existed: true,
    filePath: path.join(packageDirectory, ".npmrc"),
    localPrefix: packageDirectory,
    projectRegistry: "https://project.example/",
  });
  expect(config.setCalls).toEqual([
    { key: "audit", value: false, where: "project" },
  ]);
  expect(config.deleteCalls).toEqual([
    { key: "always-auth", where: "project" },
    { key: "//pkgs.example/:always-auth", where: "project" },
  ]);

  adapter.setPromptedRegistry("https://prompted.example/");
  expect(adapter.projectRegistry).toBe("https://project.example/");
  expect(config.setCalls).toHaveLength(1);
});

test("marks a missing file created and sets only a non-empty prompted registry", async () => {
  resetFakeConfig({ effectiveValues: { registry: "https://inherited.example/" } });
  const packageDirectory = path.resolve("fixtures", "missing-package");
  const adapter = await loadNpmConfigFileWithDependencies(
    { packageDirectory },
    createDependencies(false),
  );
  const config = requireLatestConfig();

  expect(adapter.disposition).toBe("created");
  expect(adapter.projectRegistry).toBeUndefined();
  expect(adapter.effectiveRegistry).toBe("https://inherited.example/");
  expect(() => adapter.setPromptedRegistry("  ")).toThrow(
    "A non-empty prompted registry is required.",
  );

  adapter.setPromptedRegistry(" https://prompted.example/ ");
  adapter.setPromptedRegistry("https://ignored.example/");
  expect(adapter.projectRegistry).toBe("https://prompted.example/");
  expect(config.setCalls.filter(({ key }) => key === "registry")).toEqual([
    {
      key: "registry",
      value: "https://prompted.example/",
      where: "project",
    },
  ]);
});

test("reports an already-correct project as unchanged without touching unmanaged values", async () => {
  resetFakeConfig({
    effectiveValues: { registry: "https://project.example/" },
    projectValues: {
      registry: "https://project.example/",
      "package-lock": true,
      "lockfile-version": "2",
      "legacy-peer-deps": false,
      audit: false,
      fund: false,
    },
    rawProjectValues: { registry: "https://project.example/", color: true },
  });

  const adapter = await loadNpmConfigFileWithDependencies(
    { packageDirectory: path.resolve("fixtures", "correct-package") },
    createDependencies(true),
  );

  expect(adapter.disposition).toBe("unchanged");
  expect(requireLatestConfig().setCalls).toEqual([]);
  expect(requireLatestConfig().deleteCalls).toEqual([]);
});

test("translates loading and saving failures into operation-specific adapter errors", async () => {
  const loadCause = new Error("load exploded");
  resetFakeConfig({ loadFailure: loadCause });
  const packageDirectory = path.resolve("fixtures", "failure-package");

  await expect(
    loadNpmConfigFileWithDependencies({ packageDirectory }, createDependencies(true)),
  ).rejects.toMatchObject({
    cause: loadCause,
    filePath: path.join(packageDirectory, ".npmrc"),
    name: "NpmConfigFileError",
    operation: "read",
  } satisfies Partial<NpmConfigFileError>);

  const saveCause = new Error("save exploded");
  resetFakeConfig({ saveFailure: saveCause });
  const adapter = await loadNpmConfigFileWithDependencies(
    { packageDirectory },
    createDependencies(true),
  );
  await expect(adapter.save()).rejects.toMatchObject({
    cause: saveCause,
    filePath: path.join(packageDirectory, ".npmrc"),
    name: "NpmConfigFileError",
    operation: "write",
  } satisfies Partial<NpmConfigFileError>);
});

type ResetFakeConfigOptions = {
  readonly effectiveValues?: Readonly<Record<string, unknown>>;
  readonly loadFailure?: unknown;
  readonly projectValues?: Readonly<Record<string, unknown>>;
  readonly rawProjectValues?: Readonly<Record<string, unknown>>;
  readonly saveFailure?: unknown;
};

function resetFakeConfig(options: ResetFakeConfigOptions = {}): void {
  FakeConfig.effectiveValues = options.effectiveValues ?? {};
  FakeConfig.latest = undefined;
  FakeConfig.loadFailure = options.loadFailure;
  FakeConfig.projectValues = options.projectValues ?? {};
  FakeConfig.rawProjectValues = options.rawProjectValues ?? {};
  FakeConfig.saveFailure = options.saveFailure;
}

function createDependencies(fileExists: boolean): TestDependencies {
  return {
    Config: FakeConfig,
    definitions: {
      definitions: { registry: {} },
      flatten(source, target = {}) {
        return Object.assign(target, source);
      },
      shorthands: {},
    },
    async fileExists() {
      return fileExists;
    },
  };
}

function requireLatestConfig(): FakeConfig {
  if (FakeConfig.latest === undefined) {
    throw new Error("Expected the fake npm config constructor to be called.");
  }
  return FakeConfig.latest;
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Expected a string config option.");
  }
  return value;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
    throw new TypeError("Expected a string array config option.");
  }
  return value;
}
