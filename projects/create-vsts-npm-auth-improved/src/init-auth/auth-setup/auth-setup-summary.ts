import path from "node:path";
import { AuthSetupPlan, FileChangeKind } from "./auth-setup-plan.js";

export type AuthSetupFileSummary = {
  readonly disposition: FileChangeKind;
  readonly displayName: string;
};

export type AuthSetupPackageSummary = {
  readonly directoryDisplayPath: string;
  readonly files: readonly AuthSetupFileSummary[];
};

export type AuthSetupSummary = {
  readonly changedFileCount: number;
  readonly changedPackageCount: number;
  readonly packageCount: number;
  readonly packages: readonly AuthSetupPackageSummary[];
};

export function summarizeAuthSetupPlan(plan: AuthSetupPlan): AuthSetupSummary {
  const packages = plan.packages.map(packageChange => {
    const directoryDisplayPath = formatDirectoryDisplayPath(packageChange.packageJson.displayPath);
    return {
      directoryDisplayPath,
      files: [packageChange.packageJson, packageChange.npmrc].map(fileChange => ({
        disposition: fileChange.disposition,
        displayName: path.posix.basename(fileChange.displayPath),
      })),
    };
  });
  const changedPackageCount = packages.filter(packageSummary =>
    packageSummary.files.some(file => file.disposition !== "unchanged"),
  ).length;
  const changedFileCount = packages
    .flatMap(packageSummary => packageSummary.files)
    .filter(file => file.disposition !== "unchanged").length;

  return {
    packageCount: plan.packages.length,
    changedFileCount,
    changedPackageCount,
    packages,
  };
}

export function formatAuthSetupSummary(summary: AuthSetupSummary): string {
  const heading = formatHeading(summary);
  const packageSections = summary.packages.flatMap((packageSummary, index) => [
    ...(index === 0 ? [] : [""]),
    packageSummary.directoryDisplayPath,
    ...packageSummary.files.map(
      file => `  ${file.disposition.toUpperCase().padEnd("UNCHANGED".length)}  ${file.displayName}`,
    ),
  ]);

  return [heading, "", ...packageSections].join("\n");
}

function formatHeading(summary: AuthSetupSummary): string {
  if (summary.changedFileCount === 0) {
    return "No files changed";
  }

  const changedFiles = formatCount(summary.changedFileCount, "file");
  if (summary.packageCount === 1) {
    return `Changed ${changedFiles} in 1 package`;
  }
  if (summary.changedPackageCount === summary.packageCount) {
    return `Changed ${changedFiles} across ${formatCount(summary.packageCount, "package")}`;
  }
  return `Changed ${changedFiles} across ${summary.changedPackageCount} of ${formatCount(summary.packageCount, "package")}`;
}

function formatDirectoryDisplayPath(packageJsonDisplayPath: string): string {
  const directory = path.posix.dirname(packageJsonDisplayPath);
  return directory === "." ? "./" : `${directory}/`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
