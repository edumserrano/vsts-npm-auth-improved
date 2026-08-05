export function formatNpmrcGitignoreWarning(
  ignoredDisplayPaths: readonly string[],
): string {
  const files = ignoredDisplayPaths
    .map(displayPath => `- ${displayPath}`)
    .join("\n");
  return [
    "The following .npmrc files were created or updated but are ignored by Git. They likely belong in source control so the registry configuration is available to other contributors. " +
      "Review them for credentials or other secrets, then remove the relevant .gitignore rules and commit and push the safe files:",
    "",
    files,
  ].join("\n");
}
