import { AuthSetupPlan } from "./auth-setup-plan";

export type AuthSetupSummary = {
  readonly changedPackages: number;
  readonly createdFiles: number;
  readonly packageCount: number;
  readonly unchangedFiles: number;
  readonly unchangedPackages: number;
  readonly updatedFiles: number;
};

export function summarizeAuthSetupPlan(plan: AuthSetupPlan): AuthSetupSummary {
  const files = plan.packages.flatMap((packageChange) => [
    packageChange.packageJson,
    packageChange.npmrc,
  ]);
  const changedPackages = plan.packages.filter((packageChange) =>
    [packageChange.packageJson, packageChange.npmrc].some(
      (fileChange) => fileChange.disposition !== "unchanged",
    ),
  ).length;

  return {
    packageCount: plan.packages.length,
    changedPackages,
    unchangedPackages: plan.packages.length - changedPackages,
    createdFiles: files.filter((fileChange) => fileChange.disposition === "created")
      .length,
    updatedFiles: files.filter((fileChange) => fileChange.disposition === "updated")
      .length,
    unchangedFiles: files.filter(
      (fileChange) => fileChange.disposition === "unchanged",
    ).length,
  };
}

export function formatAuthSetupSummary(summary: AuthSetupSummary): string {
  return `Packages: ${summary.packageCount} configured (${summary.changedPackages} changed, ${summary.unchangedPackages} unchanged); files: ${summary.createdFiles} created, ${summary.updatedFiles} updated, ${summary.unchangedFiles} unchanged.`;
}
