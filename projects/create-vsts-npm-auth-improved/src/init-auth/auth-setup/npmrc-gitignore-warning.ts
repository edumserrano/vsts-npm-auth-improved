import { NpmrcGitignoreCheckResult } from "./npmrc-gitignore-check";

export function formatNpmrcGitignoreWarning(
  result: NpmrcGitignoreCheckResult,
): string | undefined {
  if (result.status === "failed" || result.ignoredDisplayPaths.length === 0) {
    return undefined;
  }

  const files = result.ignoredDisplayPaths
    .map(displayPath => `- ${displayPath}`)
    .join("\n");
  return [
    "The following .npmrc files were created or updated but are ignored by Git. They likely belong in source control so the registry configuration is available to other contributors.",
    "",
    "Review them for credentials or other secrets, then remove the relevant .gitignore rules and commit and push the safe files:",
    "",
    files,
  ].join("\n");
}
