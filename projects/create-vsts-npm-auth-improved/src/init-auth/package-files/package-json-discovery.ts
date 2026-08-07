import fs from "node:fs";
import path from "node:path";
import { DirectorySearchFailure } from "../init-auth-failure.js";

const EXCLUDED_DIRECTORY_NAMES = ["node_modules"] as const;

const EXCLUDED_DIRECTORY_PATTERNS = EXCLUDED_DIRECTORY_NAMES.flatMap(
  directoryName => [
    `**/${directoryName}`,
    `**/${directoryName}/**`,
  ],
);

export type PackageJsonDiscoveryResult =
  | { readonly status: "found"; readonly packageJsonPaths: readonly string[] }
  | { readonly status: "failed"; readonly failure: DirectorySearchFailure };

export async function discoverPackageJsonFilesAsync(
  rootDirectory: string,
): Promise<PackageJsonDiscoveryResult> {
  const resolvedRoot = path.resolve(rootDirectory);

  try {
    // Globby is ESM-only while this package emits CommonJS, so it must remain a
    // dynamic import in the compiled output.
    const { globby } = await import("globby");
    const discoveredPaths = await globby(
      ["package.json", "**/package.json"],
      {
        fs,
        cwd: resolvedRoot,
        absolute: true,
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: false,
        gitignore: true,
        globalGitignore: false,
        suppressErrors: false,
        // Preserve the existing case-insensitive directory exclusions. The
        // exact basename filter below keeps package.json itself case-sensitive.
        caseSensitiveMatch: false,
        ignore: EXCLUDED_DIRECTORY_PATTERNS,
      },
    );
    const packageJsonPaths = discoveredPaths
      .map(filePath => path.resolve(filePath))
      .filter(filePath => path.basename(filePath) === "package.json")
      .sort((left, right) => comparePackageJsonPaths(resolvedRoot, left, right));

    return { status: "found", packageJsonPaths };
  } catch (cause) {
    return {
      status: "failed",
      failure: {
        type: "directory-search-failed",
        directoryPath: failureDirectoryPath(cause, resolvedRoot),
        cause,
      },
    };
  }
}

function failureDirectoryPath(cause: unknown, fallback: string): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "path" in cause &&
    typeof cause.path === "string"
  ) {
    return path.resolve(fallback, cause.path);
  }
  return fallback;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function comparePackageJsonPaths(
  rootDirectory: string,
  left: string,
  right: string,
): number {
  const leftSegments = directorySegments(rootDirectory, left);
  const rightSegments = directorySegments(rootDirectory, right);
  const sharedLength = Math.min(leftSegments.length, rightSegments.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = compareText(leftSegments[index], rightSegments[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftSegments.length - rightSegments.length;
}

function directorySegments(rootDirectory: string, filePath: string): string[] {
  const relativeDirectory = path.relative(rootDirectory, path.dirname(filePath));
  return relativeDirectory === "" ? [] : relativeDirectory.split(path.sep);
}
