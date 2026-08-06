import path from "node:path";
import { accessSync, constants, statSync } from "node:fs";
import { Command } from "commander";
import {
  buildAuthSetupPlanAsync,
  writeAuthSetupPlanAsync,
} from "./auth-setup/auth-setup-plan";
import { formatAuthSetupSummary, summarizeAuthSetupPlan } from "./auth-setup/auth-setup-summary";
import { checkChangedNpmrcFilesForGitignoreAsync } from "./auth-setup/npmrc-gitignore-check";
import { discoverPackageJsonFilesAsync } from "./package-files/package-json-discovery";
import { formatInitAuthFailure, InitAuthFailure } from "./init-auth-failure";
import {
  DEFAULT_PACKAGE_INSTALLATION_STRATEGY,
  PackageInstallationStrategy,
} from "./package-installation-strategy";
import { PromptMessages, prompts } from "./prompts-utils";

const ALL_PACKAGES_OPTION_VALUE = "__all_packages__";

export function addInitAuthCommand(program: Command): Command {
  return program
    .command("init-auth", { isDefault: true })
    .description("Configure package.json and .npmrc files for registry authentication.")
    .action(handleInitAuthCommandAsync);
}

async function handleInitAuthCommandAsync(): Promise<void> {
  let spinnerPrompt: ReturnType<typeof prompts.spinner> | null = null;

  try {
    const cwd = process.cwd();
    prompts.intro("📦🔑 Configure vsts-npm-auth-improved 📦🔑");
    const rootAnswer = await prompts.text({
      message: "Where should package.json files be searched for?",
      placeholder: "./",
      initialValue: "./",
      validate: value => validateRootDirectory(value, cwd),
    });

    if (prompts.isCancel(rootAnswer)) {
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    const rootDirectory = path.resolve(cwd, rootAnswer.trim());
    spinnerPrompt = prompts.spinner();
    spinnerPrompt.start("Searching for package.json files");
    const discoveryResult = await discoverPackageJsonFilesAsync(rootDirectory);
    if (discoveryResult.status === "failed") {
      reportInitAuthFailure(discoveryResult.failure, spinnerPrompt);
      process.exitCode = 1;
      return;
    }
    const packageJsonPaths = [...discoveryResult.packageJsonPaths];
    spinnerPrompt.stop(`Found ${formatCount(packageJsonPaths.length, "package.json file")}.`);
    spinnerPrompt = null;

    if (packageJsonPaths.length === 0) {
      prompts.log.info("No package.json files were found.");
      prompts.outro(PromptMessages.NoFilesChanged);
      process.exitCode = 0;
      return;
    }

    const packageOptions = packageJsonPaths.map(packageJsonPath => ({
      value: packageJsonPath,
      label: relativeDisplayPath(rootDirectory, packageJsonPath),
    }));
    const selection = await prompts.multiselect({
      message: "Which packages should be configured?",
      options: [
        {
          value: ALL_PACKAGES_OPTION_VALUE,
          label: "ALL",
          hint: "Configure every package",
        },
        ...packageOptions,
      ],
      required: false,
      maxItems: Math.min(packageOptions.length + 1, 12),
    });

    if (prompts.isCancel(selection)) {
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    const selectedPackagePaths = selectPackageJsonPaths(packageJsonPaths, selection);
    if (selectedPackagePaths.length === 0) {
      prompts.log.info("No packages were selected.");
      prompts.outro(PromptMessages.NoFilesChanged);
      process.exitCode = 0;
      return;
    }

    const packageInstallationStrategy = await prompts.select({
      message: "How should users install packages with automatic authentication?",
      initialValue: DEFAULT_PACKAGE_INSTALLATION_STRATEGY,
      options: [
        {
          value: "standard-npm-install" satisfies PackageInstallationStrategy,
          label: "Standard npm install",
          hint: "npm i — requires npm 12 or later",
        },
        {
          value: "custom-install-packages" satisfies PackageInstallationStrategy,
          label: "Custom npm script",
          hint: "npm run install-packages — supports npm 11 and earlier",
        },
      ],
    });

    if (prompts.isCancel(packageInstallationStrategy)) {
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    const planResult = await buildAuthSetupPlanAsync(
      rootDirectory,
      selectedPackagePaths,
      packageInstallationStrategy,
      async packageDisplayPath => {
        const registry = await prompts.text({
          message: `Registry URL for ${packageDisplayPath}`,
          placeholder: "https://registry.example.com/",
          validate: validateRegistryUrl,
        });
        if (prompts.isCancel(registry)) {
          return { status: "cancelled" };
        }
        return {
          status: "provided",
          registry: registry.trim(),
        };
      },
    );

    if (planResult.status === "cancelled") {
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    if (planResult.status === "failed") {
      reportInitAuthFailure(planResult.failure);
      process.exitCode = 1;
      return;
    }

    const { plan } = planResult;
    spinnerPrompt = prompts.spinner();
    spinnerPrompt.start("Writing configuration files");
    const writeResult = await writeAuthSetupPlanAsync(plan);
    if (writeResult.status === "failed") {
      reportInitAuthFailure(writeResult.failure, spinnerPrompt);
      process.exitCode = 1;
      return;
    }

    const gitignoreCheck = await checkChangedNpmrcFilesForGitignoreAsync(rootDirectory, plan);
    const summary = summarizeAuthSetupPlan(plan);
    spinnerPrompt.stop("Configuration files are ready.");
    spinnerPrompt = null;
    prompts.log.success(formatAuthSetupSummary(summary));
    if (gitignoreCheck.status === "checked" && gitignoreCheck.ignoredDisplayPaths.length > 0) {
      const npmrcGitIgnoredWarningMessage = formatNpmrcGitignoreWarning(gitignoreCheck.ignoredDisplayPaths);
      prompts.log.warn(npmrcGitIgnoredWarningMessage);
    }

    prompts.note(formatNextStep(packageInstallationStrategy), "Next step");
    prompts.outro("Authentication configuration complete. 😊");
    process.exitCode = 0;
  } catch (error) {
    spinnerPrompt?.stop(PromptMessages.ConfigurationAttemptFinished);
    const errorMessage = getErrorMessage(error);
    prompts.log.error(errorMessage);
    prompts.cancel(PromptMessages.CancelMayBePartial);
    process.exitCode = 1;
  }
}

function formatNextStep(packageInstallationStrategy: PackageInstallationStrategy): string {
  if (packageInstallationStrategy === "standard-npm-install") {
    return [
      "Install packages with authentication handled automatically:",
      "",
      "npm install",
      "",
      "This requires npm 12 or later.",
    ].join("\n");
  }

  return [
    "Install packages with authentication handled automatically:",
    "",
    "npm run install-packages",
    "",
    "Use this command instead of npm install.",
  ].join("\n");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.cause instanceof Error) {
      return error.cause.message;
    }
    return error.message;
  }

  return "";
}

function reportInitAuthFailure(
  failure: InitAuthFailure,
  spinner?: ReturnType<typeof prompts.spinner>,
): void {
  const message = formatInitAuthFailure(failure);
  if (spinner === undefined) {
    prompts.log.error(message);
  } else {
    spinner.error(message);
  }

  prompts.outro(
    failure.type === "file-write-failed"
      ? PromptMessages.CancelMayBePartial
      : PromptMessages.NoFilesChanged,
  );
}

function selectPackageJsonPaths(
  discoveredPaths: readonly string[],
  selection: readonly string[],
): string[] {
  if (selection.includes(ALL_PACKAGES_OPTION_VALUE)) {
    return [...discoveredPaths];
  }

  const selected = new Set(selection);
  return discoveredPaths.filter(packageJsonPath => selected.has(packageJsonPath));
}

function relativeDisplayPath(rootDirectory: string, filePath: string): string {
  const relativePath = path.relative(rootDirectory, filePath);
  return formatDisplayPath(relativePath === "" ? path.basename(filePath) : relativePath);
}

function formatDisplayPath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function validateRootDirectory(
  value: string | undefined,
  cwd: string = process.cwd(),
): string | undefined {
  const input = value?.trim();
  if (input === undefined || input === "") {
    return "Enter a directory path.";
  }

  let resolvedPath: string;
  try {
    resolvedPath = path.resolve(cwd, input);
  } catch {
    return "Enter a valid directory path.";
  }

  try {
    if (!statSync(resolvedPath).isDirectory()) {
      return `"${input}" is not a directory.`;
    }
    accessSync(resolvedPath, constants.R_OK);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return `Directory "${input}" does not exist.`;
    }
    if (isNodeError(error) && error.code === "EACCES") {
      return `Directory "${input}" is not accessible.`;
    }
    return `Cannot access directory "${input}".`;
  }

  return undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function validateRegistryUrl(value: string | undefined): string | undefined {
  const registry = value?.trim();
  if (registry === undefined || registry === "") {
    return "Enter a registry URL.";
  }

  try {
    const parsed = new URL(registry);
    if (parsed.protocol.length <= 1) {
      return "Enter an absolute registry URL including its scheme.";
    }
  } catch {
    return "Enter an absolute registry URL including its scheme.";
  }

  return undefined;
}

function formatNpmrcGitignoreWarning(ignoredDisplayPaths: readonly string[]): string {
  const files = ignoredDisplayPaths.map(displayPath => `- ${displayPath}`).join("\n");
  return [
    "The following .npmrc files were created or updated but are ignored by Git.",
    "Project-level .npmrc files are often committed so npm settings are shared with other contributors.",
    "Review each file for credentials or other secrets, then remove the relevant .gitignore rules and commit and push any files that are safe to share:",
    "",
    files,
  ].join("\n");
}
