import { stat } from "node:fs/promises";
import path from "node:path";

const MANAGED_PROJECT_VALUES = {
  "package-lock": true,
  audit: false,
  fund: false,
} as const;

type ConfigLocation = "project";

type NpmConfigData = {
  readonly raw: Readonly<Record<string, unknown>>;
};

type NpmConfig = {
  readonly argv: readonly string[];
  readonly data: {
    get(where: ConfigLocation): NpmConfigData | undefined;
  };
  readonly localPrefix: string;
  delete(key: string, where: ConfigLocation): void;
  get(key: string, where?: ConfigLocation): unknown;
  load(): Promise<void>;
  save(where: ConfigLocation): Promise<void>;
  set(key: string, value: unknown, where: ConfigLocation): void;
};

type NpmConfigDefinitionsModule = {
  readonly definitions: Readonly<Record<string, unknown>>;
  readonly flatten: (
    source: Readonly<Record<string, unknown>>,
    target?: Record<string, unknown>,
  ) => Record<string, unknown>;
  readonly shorthands: Readonly<Record<string, readonly string[]>>;
};

type NpmConfigOptions = {
  readonly argv: string[];
  readonly cwd: string;
  readonly definitions: NpmConfigDefinitionsModule["definitions"];
  readonly env: NodeJS.ProcessEnv;
  readonly flatten: NpmConfigDefinitionsModule["flatten"];
  readonly npmPath: string;
  readonly shorthands: NpmConfigDefinitionsModule["shorthands"];
  readonly warn: boolean;
};

type NpmConfigConstructor = new (options: NpmConfigOptions) => NpmConfig;

export type NpmConfigFileDisposition = "created" | "updated" | "unchanged";

export type NpmConfigFileErrorOperation = "read" | "write";

export class NpmConfigFileError extends Error {
  public constructor(
    public readonly operation: NpmConfigFileErrorOperation,
    public readonly filePath: string,
    options: { readonly cause: unknown },
  ) {
    super(
      `Could not ${operation === "read" ? "load" : "save"} npm configuration at ${filePath}.`,
      options,
    );
    this.name = "NpmConfigFileError";
  }
}

export type NpmConfigFile = {
  readonly argv: readonly string[];
  readonly disposition: NpmConfigFileDisposition;
  readonly effectiveRegistry: string | undefined;
  readonly existed: boolean;
  readonly filePath: string;
  readonly localPrefix: string;
  readonly projectRegistry: string | undefined;
  save(): Promise<void>;
  setPromptedRegistry(registry: string): void;
};

export type LoadNpmConfigFileOptions = {
  /** Additional controlled npm-style arguments. The package prefix is always forced last. */
  readonly argv?: readonly string[];
  /** Defaults to the real process environment. Primarily overridden by isolated tests. */
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  /** Defaults to the installed @npmcli/config package root. */
  readonly npmPath?: string;
  readonly packageDirectory: string;
};

type NpmConfigFileDependencies = {
  readonly Config: NpmConfigConstructor;
  readonly definitions: NpmConfigDefinitionsModule;
  fileExists(filePath: string): Promise<boolean>;
};

export async function loadNpmConfigFile(
  options: LoadNpmConfigFileOptions,
): Promise<NpmConfigFile> {
  const packageDirectory = path.resolve(options.packageDirectory);
  const filePath = path.join(packageDirectory, ".npmrc");

  let dependencies: NpmConfigFileDependencies;
  try {
    dependencies = loadDependencies();
  } catch (cause) {
    throw new NpmConfigFileError("read", filePath, { cause });
  }

  return loadNpmConfigFileWithDependencies(options, dependencies);
}

/** @internal Exported only so unit tests can isolate the third-party boundary. */
export async function loadNpmConfigFileWithDependencies(
  options: LoadNpmConfigFileOptions,
  dependencies: NpmConfigFileDependencies,
): Promise<NpmConfigFile> {
  const packageDirectory = path.resolve(options.packageDirectory);
  const filePath = path.join(packageDirectory, ".npmrc");

  try {
    const existed = await dependencies.fileExists(filePath);
    const controlledArgv = [
      "node",
      "create-vsts-npm-auth-improved",
      ...(options.argv ?? []),
      "--prefix",
      packageDirectory,
    ];
    const config = new dependencies.Config({
      argv: controlledArgv,
      cwd: packageDirectory,
      definitions: dependencies.definitions.definitions,
      env: { ...(options.env ?? process.env) },
      flatten: dependencies.definitions.flatten,
      npmPath: path.resolve(options.npmPath ?? resolveInstalledConfigRoot()),
      shorthands: dependencies.definitions.shorthands,
      warn: false,
    });

    await config.load();

    const projectRegistry = normalizeRegistry(config.get("registry", "project"));
    const effectiveRegistry = normalizeRegistry(config.get("registry"));
    const alwaysAuthKeys = getAlwaysAuthKeys(config);
    const managedValueChanges = Object.entries(MANAGED_PROJECT_VALUES).filter(
      ([key, requiredValue]) => config.get(key, "project") !== requiredValue,
    );
    const hasManagedChange =
      projectRegistry === undefined ||
      managedValueChanges.length > 0 ||
      alwaysAuthKeys.length > 0;

    for (const [key, requiredValue] of managedValueChanges) {
      config.set(key, requiredValue, "project");
    }
    for (const key of alwaysAuthKeys) {
      config.delete(key, "project");
    }

    let currentProjectRegistry = projectRegistry;
    return {
      argv: [...config.argv],
      get disposition() {
        return hasManagedChange ? (existed ? "updated" : "created") : "unchanged";
      },
      effectiveRegistry,
      existed,
      filePath,
      localPrefix: config.localPrefix,
      get projectRegistry() {
        return currentProjectRegistry;
      },
      async save() {
        try {
          await config.save("project");
        } catch (cause) {
          throw new NpmConfigFileError("write", filePath, { cause });
        }
      },
      setPromptedRegistry(registry) {
        if (currentProjectRegistry !== undefined) {
          return;
        }

        const normalizedRegistry = normalizeRegistry(registry);
        if (normalizedRegistry === undefined) {
          throw new TypeError("A non-empty prompted registry is required.");
        }

        try {
          config.set("registry", normalizedRegistry, "project");
          currentProjectRegistry = normalizedRegistry;
        } catch (cause) {
          throw new NpmConfigFileError("read", filePath, { cause });
        }
      },
    };
  } catch (cause) {
    if (cause instanceof NpmConfigFileError) {
      throw cause;
    }
    throw new NpmConfigFileError("read", filePath, { cause });
  }
}

function getAlwaysAuthKeys(config: NpmConfig): string[] {
  const projectData = config.data.get("project");
  if (projectData === undefined) {
    throw new TypeError("@npmcli/config did not expose project configuration data.");
  }

  return Object.keys(projectData.raw).filter(isAlwaysAuthKey);
}

function isAlwaysAuthKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey === "always-auth" ||
    (normalizedKey.startsWith("//") && normalizedKey.endsWith(":always-auth"))
  );
}

function normalizeRegistry(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function loadDependencies(): NpmConfigFileDependencies {
  return {
    Config: loadConfigConstructor(),
    definitions: loadDefinitionsModule(),
    fileExists,
  };
}

function loadConfigConstructor(): NpmConfigConstructor {
  const loaded: unknown = require("@npmcli/config");
  if (typeof loaded !== "function") {
    throw new TypeError("@npmcli/config did not expose a CommonJS constructor.");
  }
  return loaded as NpmConfigConstructor;
}

function loadDefinitionsModule(): NpmConfigDefinitionsModule {
  const loaded: unknown = require("@npmcli/config/lib/definitions");
  if (!isRecord(loaded)) {
    throw new TypeError("@npmcli/config/lib/definitions was not an object.");
  }

  const definitions = loaded["definitions"];
  const flatten = loaded["flatten"];
  const shorthands = loaded["shorthands"];
  if (!isRecord(definitions) || typeof flatten !== "function" || !isRecord(shorthands)) {
    throw new TypeError(
      "@npmcli/config/lib/definitions did not expose definitions, shorthands, and flatten.",
    );
  }

  return {
    definitions,
    flatten: flatten as NpmConfigDefinitionsModule["flatten"],
    shorthands: shorthands as NpmConfigDefinitionsModule["shorthands"],
  };
}

function resolveInstalledConfigRoot(): string {
  return path.dirname(require.resolve("@npmcli/config/package.json"));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new TypeError(`Expected a regular file at ${filePath}.`);
    }
    return true;
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") {
      return false;
    }
    throw cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
