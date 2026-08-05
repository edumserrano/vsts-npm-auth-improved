import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { NpmConfigFile, loadNpmConfigFileAsync } from "../src/init-auth/package-files/npm-config-file";
import {
  NpmPackageJsonFile,
  NpmPackageJsonFileError,
  loadNpmPackageJsonFileAsync,
} from "../src/init-auth/package-files/npm-package-json-file";
import {
  AuthSetupPlan,
  buildAuthSetupPlanAsync,
  writeAuthSetupPlanAsync,
} from "../src/init-auth/auth-setup/auth-setup-plan";
import { summarizeAuthSetupPlan } from "../src/init-auth/auth-setup/auth-setup-summary";

vi.mock("../src/init-auth/package-files/npm-config-file", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../src/init-auth/package-files/npm-config-file")>();
  return { ...actual, loadNpmConfigFileAsync: vi.fn() };
});

vi.mock("../src/init-auth/package-files/npm-package-json-file", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../src/init-auth/package-files/npm-package-json-file")>();
  return { ...actual, loadNpmPackageJsonFileAsync: vi.fn() };
});

const rootDirectory = path.resolve("test-root");

beforeEach(() => {
  vi.clearAllMocks();
});

test("loads all package adapters before npmrc adapters and prompts only for missing project registries", async () => {
  const events: string[] = [];
  const alphaPackageJson = packageJsonAdapter("alpha", events);
  const betaPackageJson = packageJsonAdapter("beta", events, "unchanged");
  const alphaNpmrc = npmrcAdapter("alpha", events, undefined, "created");
  const betaNpmrc = npmrcAdapter("beta", events, "https://project.example/", "unchanged");
  vi.mocked(loadNpmPackageJsonFileAsync).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load package ${name}`);
    return name === "alpha" ? alphaPackageJson : betaPackageJson;
  });
  vi.mocked(loadNpmConfigFileAsync).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load npmrc ${name}`);
    return name === "alpha" ? alphaNpmrc : betaNpmrc;
  });
  const requestRegistryAsync = vi.fn(async (displayPath: string) => {
    events.push(`prompt ${displayPath}`);
    return {
      status: "provided" as const,
      registry: "https://prompted.example/",
    };
  });

  const result = await buildAuthSetupPlanAsync(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistryAsync,
  );

  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    return;
  }
  expect(events).toEqual([
    "load package alpha",
    "load package beta",
    "load npmrc alpha",
    "load npmrc beta",
    "prompt alpha/package.json",
    "set registry alpha https://prompted.example/",
  ]);
  expect(requestRegistryAsync).toHaveBeenCalledOnce();
  expect(result.plan.packages).toMatchObject([
    {
      displayPath: "alpha/package.json",
      packageJson: {
        displayPath: "alpha/package.json",
        disposition: "updated",
        filePath: packagePath("alpha"),
      },
      npmrc: {
        displayPath: "alpha/.npmrc",
        disposition: "created",
        filePath: npmrcPath("alpha"),
      },
    },
    {
      displayPath: "beta/package.json",
      packageJson: {
        displayPath: "beta/package.json",
        disposition: "unchanged",
        filePath: packagePath("beta"),
      },
      npmrc: {
        displayPath: "beta/.npmrc",
        disposition: "unchanged",
        filePath: npmrcPath("beta"),
      },
    },
  ]);
  expect(summarizeAuthSetupPlan(result.plan)).toEqual({
    packageCount: 2,
    changedPackages: 1,
    unchangedPackages: 1,
    createdFiles: 1,
    updatedFiles: 1,
    unchangedFiles: 2,
  });
});

test("prompts for a missing project registry even when an inherited registry is effective", async () => {
  vi.mocked(loadNpmPackageJsonFileAsync).mockResolvedValue(packageJsonAdapter("alpha", []));
  const npmrc = npmrcAdapter("alpha", [], undefined, "created");
  Object.defineProperty(npmrc, "effectiveRegistry", {
    value: "https://user.example/",
  });
  vi.mocked(loadNpmConfigFileAsync).mockResolvedValue(npmrc);
  const requestRegistryAsync = vi.fn(async () => ({
    status: "provided" as const,
    registry: "https://project.example/",
  }));

  const result = await buildAuthSetupPlanAsync(rootDirectory, [packagePath("alpha")], requestRegistryAsync);

  expect(result.status).toBe("ready");
  expect(requestRegistryAsync).toHaveBeenCalledWith("alpha/package.json");
  expect(npmrc.setPromptedRegistry).toHaveBeenCalledWith("https://project.example/");
});

test("loads every selected adapter and returns an invalid package without prompting", async () => {
  const events: string[] = [];
  vi.mocked(loadNpmPackageJsonFileAsync).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load package ${name}`);
    if (name === "beta") {
      throw new NpmPackageJsonFileError("read", packagePath(name), {
        issue: "invalid-json",
        cause: new SyntaxError("malformed"),
      });
    }
    return packageJsonAdapter(name, events);
  });
  vi.mocked(loadNpmConfigFileAsync).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load npmrc ${name}`);
    return npmrcAdapter(name, events, undefined, "created");
  });
  const requestRegistryAsync = vi.fn();

  const result = await buildAuthSetupPlanAsync(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistryAsync,
  );

  expect(events.slice(0, 4)).toEqual([
    "load package alpha",
    "load package beta",
    "load npmrc alpha",
    "load npmrc beta",
  ]);
  expect(result).toMatchObject({
    status: "failed",
    failure: {
      type: "invalid-package-json",
      displayPath: "beta/package.json",
      issue: "invalid-json",
    },
  });
  expect(requestRegistryAsync).not.toHaveBeenCalled();
});

test("returns an unreadable selected npmrc without prompting", async () => {
  vi.mocked(loadNpmPackageJsonFileAsync).mockResolvedValue(packageJsonAdapter("alpha", []));
  const readError = new Error("sharing violation");
  vi.mocked(loadNpmConfigFileAsync).mockRejectedValue(readError);
  const requestRegistryAsync = vi.fn();

  const result = await buildAuthSetupPlanAsync(rootDirectory, [packagePath("alpha")], requestRegistryAsync);

  expect(result).toEqual({
    status: "failed",
    failure: {
      type: "file-read-failed",
      displayPath: "alpha/.npmrc",
      cause: readError,
    },
  });
  expect(requestRegistryAsync).not.toHaveBeenCalled();
});

test("cancels after applying earlier answers without saving any adapter", async () => {
  const events: string[] = [];
  const packageAdapters = [packageJsonAdapter("alpha", events), packageJsonAdapter("beta", events)];
  const npmrcAdapters = [
    npmrcAdapter("alpha", events, undefined, "created"),
    npmrcAdapter("beta", events, undefined, "created"),
  ];
  vi.mocked(loadNpmPackageJsonFileAsync)
    .mockResolvedValueOnce(packageAdapters[0]!)
    .mockResolvedValueOnce(packageAdapters[1]!);
  vi.mocked(loadNpmConfigFileAsync)
    .mockResolvedValueOnce(npmrcAdapters[0]!)
    .mockResolvedValueOnce(npmrcAdapters[1]!);
  const requestRegistryAsync = vi
    .fn()
    .mockResolvedValueOnce({
      status: "provided",
      registry: "https://alpha.example/",
    })
    .mockResolvedValueOnce({ status: "cancelled" });

  const result = await buildAuthSetupPlanAsync(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistryAsync,
  );

  expect(result).toEqual({ status: "cancelled" });
  for (const adapter of [...packageAdapters, ...npmrcAdapters]) {
    expect(adapter.saveAsync).not.toHaveBeenCalled();
  }
});
test("skips unchanged files and saves changed files in package then npmrc order", async () => {
  const saves: string[] = [];
  const plan = planWithFiles([
    ["alpha/package.json", "updated", saves],
    ["alpha/.npmrc", "created", saves],
    ["beta/package.json", "unchanged", saves],
    ["beta/.npmrc", "updated", saves],
  ]);

  await expect(writeAuthSetupPlanAsync(plan)).resolves.toEqual({ status: "written" });
  expect(saves).toEqual(["alpha/package.json", "alpha/.npmrc", "beta/.npmrc"]);
});

test("maps a rejected later save to its display path after earlier writes", async () => {
  const saves: string[] = [];
  const failure = new Error("disk full");
  const plan = planWithFiles([
    ["alpha/package.json", "updated", saves],
    ["alpha/.npmrc", "updated", saves],
    ["beta/package.json", "updated", saves, failure],
    ["beta/.npmrc", "updated", saves],
  ]);

  const result = await writeAuthSetupPlanAsync(plan);

  expect(result).toEqual({
    status: "failed",
    failure: {
      type: "file-write-failed",
      displayPath: "beta/package.json",
      cause: failure,
    },
  });
  expect(saves).toEqual(["alpha/package.json", "alpha/.npmrc", "beta/package.json"]);
});

function packagePath(name: string): string {
  return path.join(rootDirectory, name, "package.json");
}

function npmrcPath(name: string): string {
  return path.join(rootDirectory, name, ".npmrc");
}

function packageJsonAdapter(
  name: string,
  events: string[],
  disposition: NpmPackageJsonFile["disposition"] = "updated",
): NpmPackageJsonFile {
  return {
    disposition,
    filePath: packagePath(name),
    saveAsync: vi.fn(async () => {
      events.push(`save package ${name}`);
    }),
  };
}

function npmrcAdapter(
  name: string,
  events: string[],
  projectRegistry: string | undefined,
  disposition: NpmConfigFile["disposition"],
): NpmConfigFile {
  let currentProjectRegistry = projectRegistry;
  return {
    argv: [],
    disposition,
    effectiveRegistry: projectRegistry,
    existed: disposition !== "created",
    filePath: npmrcPath(name),
    localPrefix: path.dirname(npmrcPath(name)),
    get projectRegistry() {
      return currentProjectRegistry;
    },
    saveAsync: vi.fn(async () => {
      events.push(`save npmrc ${name}`);
    }),
    setPromptedRegistry: vi.fn((registry: string) => {
      events.push(`set registry ${name} ${registry}`);
      currentProjectRegistry = registry;
    }),
  };
}

type FileSpec = readonly [
  displayPath: string,
  disposition: "created" | "updated" | "unchanged",
  saves: string[],
  failure?: Error,
];

function planWithFiles(specs: readonly FileSpec[]): AuthSetupPlan {
  const files = specs.map(([displayPath, disposition, saves, failure]) => ({
    displayPath,
    disposition,
    filePath: path.join(rootDirectory, ...displayPath.split("/")),
    saveAsync: vi.fn(async () => {
      saves.push(displayPath);
      if (failure !== undefined) {
        throw failure;
      }
    }),
  }));
  return {
    packages: [
      {
        displayPath: "alpha/package.json",
        packageJson: files[0]!,
        npmrc: files[1]!,
      },
      {
        displayPath: "beta/package.json",
        packageJson: files[2]!,
        npmrc: files[3]!,
      },
    ],
  } as AuthSetupPlan;
}
