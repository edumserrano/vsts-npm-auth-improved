import path from "node:path";
import type { JsonObject, JsonValue } from "type-fest";
import { commonJsRequire } from "../../commonjs-require.js";
import { PackageInstallationStrategy } from "../package-installation-strategy.js";

const REGISTRY_AUTH_SCRIPT =
  "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force";
const PREINSTALL_AUTH_SCRIPT = "npm run registry-auth";
const PREINSTALL_AUTH_PREFIX = `${PREINSTALL_AUTH_SCRIPT} && `;
const CUSTOM_INSTALL_SCRIPTS = {
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

const DEPENDENCY_TYPES = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

type PackageJsonFieldValue = JsonValue | undefined;
type PackageScripts = Readonly<Record<string, string>>;
type PackageDependencies = Readonly<Record<string, string>>;

type PackageJsonUpdate = {
  scripts: PackageScripts;
  devDependencies: PackageDependencies;
  dependencies?: PackageDependencies;
  optionalDependencies?: PackageDependencies;
  peerDependencies?: PackageDependencies;
};

type NpmPackageJson = {
  readonly content: JsonValue;
  save(): Promise<void>;
  update(content: PackageJsonUpdate): NpmPackageJson;
};

type NpmPackageJsonConstructor = {
  load(packageDirectory: string): Promise<NpmPackageJson>;
};

type NpmPackageJsonFileDependencies = {
  readonly PackageJson: NpmPackageJsonConstructor;
};

type JsonParseError =
  | { readonly code: "EJSONPARSE" }
  | { readonly name: "JSONParseError" };

export type NpmPackageJsonFileDisposition = "updated" | "unchanged";

export type NpmPackageJsonFileErrorOperation = "read" | "write";

export type NpmPackageJsonFileErrorIssue =
  | "invalid-json"
  | "root-not-object";

export class NpmPackageJsonFileError extends Error {
  public readonly issue: NpmPackageJsonFileErrorIssue | undefined;

  public constructor(
    public readonly operation: NpmPackageJsonFileErrorOperation,
    public readonly filePath: string,
    options: {
      readonly cause?: unknown;
      readonly issue?: NpmPackageJsonFileErrorIssue;
    } = {},
  ) {
    super(
      options.issue === "invalid-json"
        ? `Could not parse package data at ${filePath}.`
        : options.issue === "root-not-object"
          ? `Package data at ${filePath} must be an object.`
          : `Could not ${operation === "read" ? "load" : "save"} package data at ${filePath}.`,
      "cause" in options ? { cause: options.cause } : undefined,
    );
    this.name = "NpmPackageJsonFileError";
    this.issue = options.issue;
  }
}

export type NpmPackageJsonFile = {
  readonly disposition: NpmPackageJsonFileDisposition;
  readonly filePath: string;
  saveAsync(): Promise<void>;
};

export type LoadNpmPackageJsonFileOptions = {
  readonly packageDirectory: string;
  readonly packageInstallationStrategy: PackageInstallationStrategy;
};

export async function loadNpmPackageJsonFileAsync(
  options: LoadNpmPackageJsonFileOptions,
): Promise<NpmPackageJsonFile> {
  const packageDirectory = path.resolve(options.packageDirectory);
  const filePath = path.join(packageDirectory, "package.json");

  let dependencies: NpmPackageJsonFileDependencies;
  try {
    dependencies = { PackageJson: loadPackageJsonConstructor() };
  } catch (cause) {
    throw new NpmPackageJsonFileError("read", filePath, { cause });
  }

  return loadNpmPackageJsonFileWithDependenciesAsync(options, dependencies);
}

async function loadNpmPackageJsonFileWithDependenciesAsync(
  options: LoadNpmPackageJsonFileOptions,
  dependencies: NpmPackageJsonFileDependencies,
): Promise<NpmPackageJsonFile> {
  const packageDirectory = path.resolve(options.packageDirectory);
  const filePath = path.join(packageDirectory, "package.json");

  let packageJson: NpmPackageJson;
  try {
    packageJson = await dependencies.PackageJson.load(packageDirectory);
  } catch (cause) {
    throw new NpmPackageJsonFileError("read", filePath, {
      cause,
      ...(isJsonParseError(cause) ? { issue: "invalid-json" as const } : {}),
    });
  }

  if (!isJsonObject(packageJson.content)) {
    throw new NpmPackageJsonFileError("read", filePath, {
      issue: "root-not-object",
    });
  }

  const content = packageJson.content;
  const existingScripts = readPackageScripts(content["scripts"]);
  const scripts = buildScripts(
    existingScripts,
    options.packageInstallationStrategy,
  );
  const devDependencies: PackageDependencies = {
    ...readPackageDependencies(content["devDependencies"]),
    "vsts-npm-auth-improved": "latest",
  };
  const disposition = hasRequiredSemanticState(
    content,
    scripts,
    devDependencies,
  )
    ? "unchanged"
    : "updated";

  if (disposition === "updated") {
    const update: PackageJsonUpdate = {
      scripts,
      devDependencies,
    };
    for (const dependencyType of DEPENDENCY_TYPES) {
      if (dependencyType === "devDependencies") {
        continue;
      }
      const dependenciesForType = readValidPackageDependencies(content[dependencyType]);
      if (dependenciesForType !== undefined) {
        update[dependencyType] = dependenciesForType;
      }
    }

    try {
      packageJson.update(update);
    } catch (cause) {
      throw new NpmPackageJsonFileError("read", filePath, { cause });
    }
  }

  return {
    disposition,
    filePath,
    async saveAsync() {
      if (disposition === "unchanged") {
        return;
      }

      try {
        await packageJson.save();
      } catch (cause) {
        throw new NpmPackageJsonFileError("write", filePath, { cause });
      }
    },
  };
}

function buildScripts(
  existingScripts: PackageScripts,
  packageInstallationStrategy: PackageInstallationStrategy,
): PackageScripts {
  if (packageInstallationStrategy === "standard-npm-install") {
    return buildStandardInstallScripts(existingScripts);
  }
  return buildCustomInstallScripts(existingScripts);
}

function buildStandardInstallScripts(existingScripts: PackageScripts): PackageScripts {
  const existingPreinstall = existingScripts["preinstall"];
  const preinstall =
    existingPreinstall === undefined
      ? PREINSTALL_AUTH_SCRIPT
      : hasManagedAuthPrefix(existingPreinstall)
        ? existingPreinstall
        : `${PREINSTALL_AUTH_PREFIX}${existingPreinstall}`;
  const unrelatedScripts = Object.fromEntries(
    Object.entries(existingScripts).filter(([name, script]) => {
      if (name === "registry-auth" || name === "preinstall") {
        return false;
      }
      return !isGeneratedCustomInstallScript(name, script);
    }),
  );

  return {
    "registry-auth": REGISTRY_AUTH_SCRIPT,
    preinstall,
    ...unrelatedScripts,
  };
}

function buildCustomInstallScripts(existingScripts: PackageScripts): PackageScripts {
  const existingPreinstall = existingScripts["preinstall"];
  const restoredPreinstall = restorePreinstallWithoutManagedAuth(existingPreinstall);
  const unrelatedScripts = Object.fromEntries(
    Object.entries(existingScripts).filter(
      ([name]) =>
        name !== "registry-auth" && name !== "preinstall" && !(name in CUSTOM_INSTALL_SCRIPTS),
    ),
  );

  return {
    "registry-auth": REGISTRY_AUTH_SCRIPT,
    ...CUSTOM_INSTALL_SCRIPTS,
    ...(restoredPreinstall === undefined ? {} : { preinstall: restoredPreinstall }),
    ...unrelatedScripts,
  };
}

function hasManagedAuthPrefix(script: string): boolean {
  return script === PREINSTALL_AUTH_SCRIPT || script.startsWith(PREINSTALL_AUTH_PREFIX);
}

function restorePreinstallWithoutManagedAuth(script: string | undefined): string | undefined {
  if (script === undefined || script === PREINSTALL_AUTH_SCRIPT) {
    return undefined;
  }
  return script.startsWith(PREINSTALL_AUTH_PREFIX)
    ? script.slice(PREINSTALL_AUTH_PREFIX.length)
    : script;
}

function isGeneratedCustomInstallScript(name: string, script: string): boolean {
  return (
    name in CUSTOM_INSTALL_SCRIPTS &&
    CUSTOM_INSTALL_SCRIPTS[name as keyof typeof CUSTOM_INSTALL_SCRIPTS] === script
  );
}

function hasRequiredSemanticState(
  content: JsonObject,
  scripts: PackageScripts,
  devDependencies: PackageDependencies,
): boolean {
  return (
    isOrderedPackageScriptsEqual(content["scripts"], scripts) &&
    isPackageDependenciesEqual(content["devDependencies"], devDependencies)
  );
}

function isOrderedPackageScriptsEqual(
  value: PackageJsonFieldValue,
  expected: PackageScripts,
): boolean {
  const current = readValidPackageScripts(value);
  if (current === undefined) {
    return false;
  }

  const currentEntries = Object.entries(current);
  const expectedEntries = Object.entries(expected);
  return (
    currentEntries.length === expectedEntries.length &&
    currentEntries.every(
      ([name, script], index) =>
        name === expectedEntries[index]?.[0] && script === expectedEntries[index]?.[1],
    )
  );
}

function isPackageDependenciesEqual(
  value: PackageJsonFieldValue,
  expected: PackageDependencies,
): boolean {
  const current = readValidPackageDependencies(value);
  if (current === undefined) {
    return false;
  }

  const currentKeys = Object.keys(current);
  return (
    currentKeys.length === Object.keys(expected).length &&
    currentKeys.every((key) => current[key] === expected[key])
  );
}

function readPackageScripts(value: PackageJsonFieldValue): PackageScripts {
  return readStringRecord(value);
}

function readPackageDependencies(
  value: PackageJsonFieldValue,
): PackageDependencies {
  return readStringRecord(value);
}

function readStringRecord(
  value: PackageJsonFieldValue,
): Readonly<Record<string, string>> {
  if (!isJsonObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readValidPackageScripts(
  value: PackageJsonFieldValue,
): PackageScripts | undefined {
  return readValidStringRecord(value);
}

function readValidPackageDependencies(
  value: PackageJsonFieldValue,
): PackageDependencies | undefined {
  return readValidStringRecord(value);
}

function readValidStringRecord(
  value: PackageJsonFieldValue,
): Readonly<Record<string, string>> | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return Object.values(value).every((item) => typeof item === "string")
    ? (value as Record<string, string>)
    : undefined;
}

function loadPackageJsonConstructor(): NpmPackageJsonConstructor {
  const loaded: unknown = commonJsRequire("@npmcli/package-json");
  if (!isNpmPackageJsonConstructor(loaded)) {
    throw new TypeError(
      "@npmcli/package-json did not expose its CommonJS load function.",
    );
  }
  return loaded;
}

function isNpmPackageJsonConstructor(
  value: unknown,
): value is NpmPackageJsonConstructor {
  return (
    (typeof value === "function" || isJsonObject(value)) &&
    typeof Reflect.get(value, "load") === "function"
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonParseError(error: unknown): error is JsonParseError {
  return (
    isJsonObject(error) &&
    (error["code"] === "EJSONPARSE" || error["name"] === "JSONParseError")
  );
}
