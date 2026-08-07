import { stat } from "node:fs/promises";
import path from "node:path";
import { commonJsRequire } from "../../commonjs-require.js";

const MANAGED_PROJECT_VALUES = {
  "package-lock": true,
  audit: false,
  fund: false,
} as const;

type ConfigLocation = "project";

type NpmConfigPrimitive = string | number | boolean | null | undefined;
type NpmConfigValue =
  | NpmConfigPrimitive
  | readonly NpmConfigValue[]
  | NpmConfigRecord;
type NpmConfigRecord = { readonly [key: string]: NpmConfigValue };
type MutableNpmConfigRecord = { [key: string]: NpmConfigValue };
type NpmConfigDefinition = object;
type NpmConfigDefinitions = Readonly<Record<string, NpmConfigDefinition>>;
type NpmConfigShorthands = Readonly<Record<string, readonly string[]>>;

type NpmConfigData = {
  readonly raw: NpmConfigRecord;
};

type NpmConfig = {
  readonly argv: readonly string[];
  readonly data: {
    get(where: ConfigLocation): NpmConfigData | undefined;
  };
  readonly localPrefix: string;
  delete(key: string, where: ConfigLocation): void;
  get(key: string, where?: ConfigLocation): NpmConfigValue;
  load(): Promise<void>;
  save(where: ConfigLocation): Promise<void>;
  set(key: string, value: NpmConfigValue, where: ConfigLocation): void;
};

type NpmConfigDefinitionsModule = {
  readonly definitions: NpmConfigDefinitions;
  readonly flatten: (
    source: NpmConfigRecord,
    target?: MutableNpmConfigRecord,
  ) => MutableNpmConfigRecord;
  readonly shorthands: NpmConfigShorthands;
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
  saveAsync(): Promise<void>;
  setPromptedRegistry(registry: string): void;
};

export type LoadNpmConfigFileOptions = {
  /** Additional controlled npm-style arguments. The package prefix is always last. */
  readonly argv?: readonly string[];
  /** The default is the real process environment. Isolated tests can override it. */
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  /** The default is the installed @npmcli/config package root. */
  readonly npmPath?: string;
  readonly packageDirectory: string;
};

type NpmConfigFileDependencies = {
  readonly Config: NpmConfigConstructor;
  readonly definitions: NpmConfigDefinitionsModule;
  fileExistsAsync(filePath: string): Promise<boolean>;
};

export async function loadNpmConfigFileAsync(
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

  return loadNpmConfigFileWithDependenciesAsync(options, dependencies);
}

async function loadNpmConfigFileWithDependenciesAsync(
  options: LoadNpmConfigFileOptions,
  dependencies: NpmConfigFileDependencies,
): Promise<NpmConfigFile> {
  const packageDirectory = path.resolve(options.packageDirectory);
  const filePath = path.join(packageDirectory, ".npmrc");

  try {
    const existed = await dependencies.fileExistsAsync(filePath);
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
      async saveAsync() {
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

function normalizeRegistry(value: NpmConfigValue): string | undefined {
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
    fileExistsAsync,
  };
}

function loadConfigConstructor(): NpmConfigConstructor {
  const loaded: unknown = commonJsRequire("@npmcli/config");
  if (!isNpmConfigConstructor(loaded)) {
    throw new TypeError("@npmcli/config did not expose a CommonJS constructor.");
  }
  return loaded;
}

function loadDefinitionsModule(): NpmConfigDefinitionsModule {
  const loaded: unknown = commonJsRequire("@npmcli/config/lib/definitions");
  if (!isRecord(loaded)) {
    throw new TypeError("@npmcli/config/lib/definitions was not an object.");
  }

  if (!isNpmConfigDefinitionsModule(loaded)) {
    throw new TypeError(
      "@npmcli/config/lib/definitions did not expose definitions, shorthands, and flatten.",
    );
  }

  return loaded;
}

function resolveInstalledConfigRoot(): string {
  return path.dirname(commonJsRequire.resolve("@npmcli/config/package.json"));
}

async function fileExistsAsync(filePath: string): Promise<boolean> {
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

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNpmConfigConstructor(
  value: unknown,
): value is NpmConfigConstructor {
  return typeof value === "function";
}

function isNpmConfigDefinitionsModule(
  value: unknown,
): value is NpmConfigDefinitionsModule {
  return (
    isRecord(value) &&
    "definitions" in value &&
    "flatten" in value &&
    "shorthands" in value &&
    isNpmConfigDefinitions(value.definitions) &&
    isNpmConfigFlatten(value.flatten) &&
    isNpmConfigShorthands(value.shorthands)
  );
}

function isNpmConfigDefinitions(
  value: unknown,
): value is NpmConfigDefinitions {
  return (
    isRecord(value) &&
    Object.keys(value).every(key =>
      isNpmConfigDefinition(Reflect.get(value, key)),
    )
  );
}

function isNpmConfigDefinition(
  value: unknown,
): value is NpmConfigDefinition {
  return isRecord(value);
}

function isNpmConfigFlatten(
  value: unknown,
): value is NpmConfigDefinitionsModule["flatten"] {
  return typeof value === "function";
}

function isNpmConfigShorthands(
  value: unknown,
): value is NpmConfigShorthands {
  return (
    isRecord(value) &&
    Object.keys(value).every(key => {
      const shorthand: unknown = Reflect.get(value, key);
      return (
        Array.isArray(shorthand) &&
        shorthand.every(argument => typeof argument === "string")
      );
    })
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
