import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { NpmConfigFile, loadNpmConfigFile } from "../src/init-auth/package-files/npm-config-file";
import {
  NpmPackageJsonFile,
  NpmPackageJsonFileError,
  loadNpmPackageJsonFile,
} from "../src/init-auth/package-files/npm-package-json-file";
import {
  AuthSetupPlan,
  buildAuthSetupPlan,
  writeAuthSetupPlan,
} from "../src/init-auth/auth-setup/auth-setup-plan";
import { summarizeAuthSetupPlan } from "../src/init-auth/auth-setup/auth-setup-summary";

vi.mock("../src/init-auth/package-files/npm-config-file", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../src/init-auth/package-files/npm-config-file")>();
  return { ...actual, loadNpmConfigFile: vi.fn() };
});

vi.mock("../src/init-auth/package-files/npm-package-json-file", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../src/init-auth/package-files/npm-package-json-file")>();
  return { ...actual, loadNpmPackageJsonFile: vi.fn() };
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
  vi.mocked(loadNpmPackageJsonFile).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load package ${name}`);
    return name === "alpha" ? alphaPackageJson : betaPackageJson;
  });
  vi.mocked(loadNpmConfigFile).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load npmrc ${name}`);
    return name === "alpha" ? alphaNpmrc : betaNpmrc;
  });
  const requestRegistry = vi.fn(async (displayPath: string) => {
    events.push(`prompt ${displayPath}`);
    return {
      status: "provided" as const,
      registry: "https://prompted.example/",
    };
  });

  const result = await buildAuthSetupPlan(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistry,
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
  expect(requestRegistry).toHaveBeenCalledOnce();
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
  vi.mocked(loadNpmPackageJsonFile).mockResolvedValue(packageJsonAdapter("alpha", []));
  const npmrc = npmrcAdapter("alpha", [], undefined, "created");
  Object.defineProperty(npmrc, "effectiveRegistry", {
    value: "https://user.example/",
  });
  vi.mocked(loadNpmConfigFile).mockResolvedValue(npmrc);
  const requestRegistry = vi.fn(async () => ({
    status: "provided" as const,
    registry: "https://project.example/",
  }));

  const result = await buildAuthSetupPlan(rootDirectory, [packagePath("alpha")], requestRegistry);

  expect(result.status).toBe("ready");
  expect(requestRegistry).toHaveBeenCalledWith("alpha/package.json");
  expect(npmrc.setPromptedRegistry).toHaveBeenCalledWith("https://project.example/");
});

test("loads every selected adapter and returns an invalid package without prompting", async () => {
  const events: string[] = [];
  vi.mocked(loadNpmPackageJsonFile).mockImplementation(async ({ packageDirectory }) => {
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
  vi.mocked(loadNpmConfigFile).mockImplementation(async ({ packageDirectory }) => {
    const name = path.basename(packageDirectory);
    events.push(`load npmrc ${name}`);
    return npmrcAdapter(name, events, undefined, "created");
  });
  const requestRegistry = vi.fn();

  const result = await buildAuthSetupPlan(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistry,
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
  expect(requestRegistry).not.toHaveBeenCalled();
});

test("returns an unreadable selected npmrc without prompting", async () => {
  vi.mocked(loadNpmPackageJsonFile).mockResolvedValue(packageJsonAdapter("alpha", []));
  const readError = new Error("sharing violation");
  vi.mocked(loadNpmConfigFile).mockRejectedValue(readError);
  const requestRegistry = vi.fn();

  const result = await buildAuthSetupPlan(rootDirectory, [packagePath("alpha")], requestRegistry);

  expect(result).toEqual({
    status: "failed",
    failure: {
      type: "file-read-failed",
      displayPath: "alpha/.npmrc",
      cause: readError,
    },
  });
  expect(requestRegistry).not.toHaveBeenCalled();
});

test("cancels after applying earlier answers without saving any adapter", async () => {
  const events: string[] = [];
  const packageAdapters = [packageJsonAdapter("alpha", events), packageJsonAdapter("beta", events)];
  const npmrcAdapters = [
    npmrcAdapter("alpha", events, undefined, "created"),
    npmrcAdapter("beta", events, undefined, "created"),
  ];
  vi.mocked(loadNpmPackageJsonFile)
    .mockResolvedValueOnce(packageAdapters[0]!)
    .mockResolvedValueOnce(packageAdapters[1]!);
  vi.mocked(loadNpmConfigFile)
    .mockResolvedValueOnce(npmrcAdapters[0]!)
    .mockResolvedValueOnce(npmrcAdapters[1]!);
  const requestRegistry = vi
    .fn()
    .mockResolvedValueOnce({
      status: "provided",
      registry: "https://alpha.example/",
    })
    .mockResolvedValueOnce({ status: "cancelled" });

  const result = await buildAuthSetupPlan(
    rootDirectory,
    [packagePath("alpha"), packagePath("beta")],
    requestRegistry,
  );

  expect(result).toEqual({ status: "cancelled" });
  for (const adapter of [...packageAdapters, ...npmrcAdapters]) {
    expect(adapter.save).not.toHaveBeenCalled();
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

  await expect(writeAuthSetupPlan(plan)).resolves.toEqual({ status: "written" });
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

  const result = await writeAuthSetupPlan(plan);

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
    save: vi.fn(async () => {
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
    save: vi.fn(async () => {
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
    save: vi.fn(async () => {
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
