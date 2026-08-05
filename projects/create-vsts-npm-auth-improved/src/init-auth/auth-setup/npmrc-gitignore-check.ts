import path from "node:path";
import { AuthSetupPlan, PlannedNpmrcChange } from "./auth-setup-plan";

export type NpmrcGitignoreCheckResult =
  | {
      readonly status: "checked";
      readonly ignoredDisplayPaths: readonly string[];
    }
  | {
      readonly status: "failed";
      readonly cause: unknown;
    };

export async function checkChangedNpmrcFilesForGitignore(
  rootDirectory: string,
  plan: AuthSetupPlan,
): Promise<NpmrcGitignoreCheckResult> {
  const changedNpmrcFiles = plan.packages
    .map(packageChange => packageChange.npmrc)
    .filter(isChangedNpmrcFile);
  if (changedNpmrcFiles.length === 0) {
    return { status: "checked", ignoredDisplayPaths: [] };
  }

  const resolvedRoot = path.resolve(rootDirectory);
  try {
    // Globby is ESM-only while this package emits CommonJS, so it must remain a
    // dynamic import in the compiled output.
    const { convertPathToPattern, globby } = await import("globby");
    const candidatePatterns = changedNpmrcFiles.map(fileChange =>
      convertPathToPattern(path.relative(resolvedRoot, fileChange.filePath)),
    );
    const unignoredPaths = await globby(candidatePatterns, {
      cwd: resolvedRoot,
      absolute: true,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      gitignore: true,
      globalGitignore: false,
      suppressErrors: false,
    });
    const unignoredPathSet = new Set(unignoredPaths.map(filePath => path.resolve(filePath)));
    return {
      status: "checked",
      ignoredDisplayPaths: changedNpmrcFiles
        .filter(fileChange => !unignoredPathSet.has(path.resolve(fileChange.filePath)))
        .map(fileChange => fileChange.displayPath),
    };
  } catch (cause) {
    return { status: "failed", cause };
  }
}

function isChangedNpmrcFile(fileChange: PlannedNpmrcChange): fileChange is PlannedNpmrcChange & {
  readonly disposition: "created" | "updated";
} {
  return fileChange.disposition !== "unchanged";
}
