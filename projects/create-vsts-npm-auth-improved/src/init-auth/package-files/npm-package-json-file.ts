import path from "node:path";

const VSTS_NPM_AUTH_IMPROVED_PACKAGE_SPEC = "alpha";

const REQUIRED_SCRIPTS = {
  "registry-auth":
    `npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved@${VSTS_NPM_AUTH_IMPROVED_PACKAGE_SPEC} -c ./.npmrc --read --no-force`,
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

const DEPENDENCY_TYPES = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

type JsonObject = Record<string, unknown>;
type StringMap = Readonly<Record<string, string>>;

type NpmPackageJson = {
  readonly content: unknown;
  save(): Promise<void>;
  update(content: Readonly<Record<string, unknown>>): NpmPackageJson;
};

type NpmPackageJsonConstructor = {
  load(packageDirectory: string): Promise<NpmPackageJson>;
};

type NpmPackageJsonFileDependencies = {
  readonly PackageJson: NpmPackageJsonConstructor;
};

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

/** @internal Exported only so unit tests can isolate the third-party boundary. */
export async function loadNpmPackageJsonFileWithDependenciesAsync(
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
  const scripts = buildScripts(content["scripts"]);
  const devDependencies = {
    ...readStringMap(content["devDependencies"]),
    "vsts-npm-auth-improved": VSTS_NPM_AUTH_IMPROVED_PACKAGE_SPEC,
  };
  const disposition = hasRequiredSemanticState(
    content,
    scripts,
    devDependencies,
  )
    ? "unchanged"
    : "updated";

  if (disposition === "updated") {
    const update: Record<string, unknown> = {
      scripts,
      devDependencies,
    };
    for (const dependencyType of DEPENDENCY_TYPES) {
      if (dependencyType === "devDependencies") {
        continue;
      }
      const dependenciesForType = readValidStringMap(content[dependencyType]);
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

function buildScripts(value: unknown): Readonly<Record<string, string>> {
  const existingScripts = readStringMap(value);
  const unrelatedScripts = Object.fromEntries(
    Object.entries(existingScripts).filter(([name]) => !(name in REQUIRED_SCRIPTS)),
  );
  return { ...REQUIRED_SCRIPTS, ...unrelatedScripts };
}

function hasRequiredSemanticState(
  content: JsonObject,
  scripts: StringMap,
  devDependencies: StringMap,
): boolean {
  return (
    isOrderedStringMapEqual(content["scripts"], scripts) &&
    isStringMapEqual(content["devDependencies"], devDependencies)
  );
}

function isOrderedStringMapEqual(value: unknown, expected: StringMap): boolean {
  const current = readValidStringMap(value);
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

function isStringMapEqual(value: unknown, expected: StringMap): boolean {
  const current = readValidStringMap(value);
  if (current === undefined) {
    return false;
  }

  const currentKeys = Object.keys(current);
  return (
    currentKeys.length === Object.keys(expected).length &&
    currentKeys.every((key) => current[key] === expected[key])
  );
}

function readStringMap(value: unknown): StringMap {
  if (!isJsonObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readValidStringMap(value: unknown): StringMap | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return Object.values(value).every((item) => typeof item === "string")
    ? (value as Record<string, string>)
    : undefined;
}

function loadPackageJsonConstructor(): NpmPackageJsonConstructor {
  const loaded: unknown = require("@npmcli/package-json");
  if (
    (typeof loaded !== "function" && !isJsonObject(loaded)) ||
    typeof Reflect.get(loaded, "load") !== "function"
  ) {
    throw new TypeError(
      "@npmcli/package-json did not expose its CommonJS load function.",
    );
  }
  return loaded as NpmPackageJsonConstructor;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonParseError(error: unknown): boolean {
  return (
    isJsonObject(error) &&
    (error["code"] === "EJSONPARSE" || error["name"] === "JSONParseError")
  );
}
