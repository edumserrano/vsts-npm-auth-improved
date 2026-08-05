import path from "node:path";
import {
  FileReadFailure,
  FileWriteFailure,
  InvalidPackageJsonFailure,
} from "../init-auth-failure";
import {
  loadNpmConfigFileAsync,
  NpmConfigFile,
  NpmConfigFileError,
} from "../package-files/npm-config-file";
import {
  loadNpmPackageJsonFileAsync,
  NpmPackageJsonFile,
  NpmPackageJsonFileError,
} from "../package-files/npm-package-json-file";

export type FileChangeKind = "created" | "updated" | "unchanged";

export type PlannedFileChange = {
  readonly displayPath: string;
  readonly disposition: FileChangeKind;
  readonly filePath: string;
  readonly saveAsync: () => Promise<void>;
};

export type PlannedPackageJsonChange = PlannedFileChange & {
  readonly disposition: "updated" | "unchanged";
};

export type PlannedNpmrcChange = PlannedFileChange;

export type PlannedPackageChange = {
  readonly displayPath: string;
  readonly npmrc: PlannedNpmrcChange;
  readonly packageJson: PlannedPackageJsonChange;
};

export type AuthSetupPlan = {
  readonly packages: readonly PlannedPackageChange[];
};

export type AuthSetupPlanCancelled = {
  readonly status: "cancelled";
};

export type AuthSetupPlanFailed = {
  readonly status: "failed";
  readonly failure: FileReadFailure | InvalidPackageJsonFailure;
};

export type AuthSetupPlanReady = {
  readonly plan: AuthSetupPlan;
  readonly status: "ready";
};

export type AuthSetupPlanResult =
  | AuthSetupPlanCancelled
  | AuthSetupPlanFailed
  | AuthSetupPlanReady;

export type WriteAuthSetupPlanWritten = {
  readonly status: "written";
};

export type WriteAuthSetupPlanFailed = {
  readonly status: "failed";
  readonly failure: FileWriteFailure;
};

export type WriteAuthSetupPlanResult =
  | WriteAuthSetupPlanWritten
  | WriteAuthSetupPlanFailed;

type RegistryProvided = {
  readonly registry: string;
  readonly status: "provided";
};

type RegistryRequestCancelled = {
  readonly status: "cancelled";
};

type RegistryResolutionResult = RegistryProvided | RegistryRequestCancelled;

export type RequestRegistryAsync = (
  packageDisplayPath: string,
) => Promise<RegistryResolutionResult>;

type LoadedPackageFiles = {
  readonly displayPath: string;
  readonly npmrc: NpmConfigFile;
  readonly npmrcDisplayPath: string;
  readonly packageJson: NpmPackageJsonFile;
};

export async function buildAuthSetupPlanAsync(
  rootDirectory: string,
  packageJsonPaths: readonly string[],
  requestRegistryAsync: RequestRegistryAsync,
): Promise<AuthSetupPlanResult> {
  // Load all package adapters before any adjacent npm configuration. Adapter
  // loading both validates package data and prepares its changes in memory.
  const packageJsonResults = await Promise.allSettled(
    packageJsonPaths.map((packageJsonPath) =>
      loadNpmPackageJsonFileAsync({ packageDirectory: path.dirname(packageJsonPath) }),
    ),
  );

  const npmrcResults = await Promise.allSettled(
    packageJsonPaths.map((packageJsonPath) =>
      loadNpmConfigFileAsync({ packageDirectory: path.dirname(packageJsonPath) }),
    ),
  );

  const loadFailure = findLoadFailure(
    rootDirectory,
    packageJsonPaths,
    packageJsonResults,
    npmrcResults,
  );
  if (loadFailure !== undefined) {
    return { status: "failed", failure: loadFailure };
  }

  const loadedPackages = packageJsonPaths.map((packageJsonPath, index) => {
    const packageJsonResult = packageJsonResults[index];
    const npmrcResult = npmrcResults[index];
    if (
      packageJsonResult?.status !== "fulfilled" ||
      npmrcResult?.status !== "fulfilled"
    ) {
      throw new Error("A selected package file did not have a load result.");
    }

    return {
      displayPath: relativeDisplayPath(rootDirectory, packageJsonPath),
      npmrc: npmrcResult.value,
      npmrcDisplayPath: relativeDisplayPath(rootDirectory, npmrcResult.value.filePath),
      packageJson: packageJsonResult.value,
    } satisfies LoadedPackageFiles;
  });

  // Registry prompts depend only on the project layer. Inherited user, global,
  // environment, and CLI values must not suppress creation of a project value.
  for (const loadedPackage of loadedPackages) {
    if (loadedPackage.npmrc.projectRegistry === undefined) {
      const registryResult = await requestRegistryAsync(loadedPackage.displayPath);
      if (registryResult.status === "cancelled") {
        return { status: "cancelled" };
      }
      loadedPackage.npmrc.setPromptedRegistry(registryResult.registry);
    }
  }

  return {
    status: "ready",
    plan: {
      packages: loadedPackages.map(buildPlannedPackageChange),
    },
  };
}

export async function writeAuthSetupPlanAsync(
  plan: AuthSetupPlan,
): Promise<WriteAuthSetupPlanResult> {
  for (const packageChange of plan.packages) {
    // Retain package order and save package.json before its adjacent .npmrc.
    for (const fileChange of [packageChange.packageJson, packageChange.npmrc]) {
      if (fileChange.disposition === "unchanged") {
        continue;
      }

      try {
        await fileChange.saveAsync();
      } catch (cause) {
        return {
          status: "failed",
          failure: {
            type: "file-write-failed",
            displayPath: fileChange.displayPath,
            cause: unwrapAdapterError(cause),
          },
        };
      }
    }
  }
  return { status: "written" };
}

function findLoadFailure(
  rootDirectory: string,
  packageJsonPaths: readonly string[],
  packageJsonResults: readonly PromiseSettledResult<NpmPackageJsonFile>[],
  npmrcResults: readonly PromiseSettledResult<NpmConfigFile>[],
): FileReadFailure | InvalidPackageJsonFailure | undefined {
  for (let index = 0; index < packageJsonPaths.length; index += 1) {
    const packageJsonPath = packageJsonPaths[index];
    const packageJsonResult = packageJsonResults[index];
    if (packageJsonPath === undefined || packageJsonResult === undefined) {
      throw new Error("A selected package.json did not have a load result.");
    }

    if (packageJsonResult.status === "rejected") {
      const displayPath = relativeDisplayPath(rootDirectory, packageJsonPath);
      const cause = packageJsonResult.reason;
      if (cause instanceof NpmPackageJsonFileError && cause.issue !== undefined) {
        return {
          type: "invalid-package-json",
          displayPath,
          issue: cause.issue,
          ...(cause.cause === undefined ? {} : { cause: cause.cause }),
        };
      }
      return {
        type: "file-read-failed",
        displayPath,
        cause: unwrapAdapterError(cause),
      };
    }
  }

  for (let index = 0; index < packageJsonPaths.length; index += 1) {
    const packageJsonPath = packageJsonPaths[index];
    const npmrcResult = npmrcResults[index];
    if (packageJsonPath === undefined || npmrcResult === undefined) {
      throw new Error("A selected .npmrc did not have a load result.");
    }

    if (npmrcResult.status === "rejected") {
      const npmrcPath = path.join(path.dirname(packageJsonPath), ".npmrc");
      return {
        type: "file-read-failed",
        displayPath: relativeDisplayPath(rootDirectory, npmrcPath),
        cause: unwrapAdapterError(npmrcResult.reason),
      };
    }
  }

  return undefined;
}

function buildPlannedPackageChange(
  loadedPackage: LoadedPackageFiles,
): PlannedPackageChange {
  return {
    displayPath: loadedPackage.displayPath,
    packageJson: {
      displayPath: loadedPackage.displayPath,
      disposition: loadedPackage.packageJson.disposition,
      filePath: loadedPackage.packageJson.filePath,
      saveAsync: () => loadedPackage.packageJson.saveAsync(),
    },
    npmrc: {
      displayPath: loadedPackage.npmrcDisplayPath,
      disposition: loadedPackage.npmrc.disposition,
      filePath: loadedPackage.npmrc.filePath,
      saveAsync: () => loadedPackage.npmrc.saveAsync(),
    },
  };
}

function relativeDisplayPath(rootDirectory: string, filePath: string): string {
  const relativePath = path.relative(rootDirectory, filePath);
  const displayPath = relativePath === "" ? path.basename(filePath) : relativePath;
  return displayPath.replaceAll(path.sep, "/");
}

function unwrapAdapterError(error: unknown): unknown {
  if (
    (error instanceof NpmConfigFileError ||
      error instanceof NpmPackageJsonFileError) &&
    error.cause !== undefined
  ) {
    return error.cause;
  }
  return error;
}
