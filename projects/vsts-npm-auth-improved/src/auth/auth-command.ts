import { Command, InvalidArgumentError } from "commander";
import { isCI } from "ci-info";
import {
  isVstsNpmAuthSuccessful,
  runVstsNpmAuthAsync,
  VstsNpmAuthOptions,
  VstsNpmAuthResult,
} from "./vsts-npm-auth.js";
import { PromptMessages, prompts } from "./prompts-utils.js";
import { packageName, packageVersion } from "../package-json-utils.js";
import { ForceAcquisitionOption, getAuthOptionsAsync, TokenScope } from "./get-auth-options.js";
import {
  getRegistryErrorMessage,
  getRegistryFromConfigFile,
} from "./get-registry-from-config-file.js";

export function addAuthCommand(program: Command): Command {
  return program
    .command("auth", { isDefault: true })
    .description("Authenticate on Windows using vsts-npm-auth NPM package")
    .option("-c, --config-path <paths>", "Comma-separated paths to .npmrc config files")
    .option(
      "-t, --target-config <path>",
      "Path to the .npmrc that receives credentials (default: ~/.npmrc)",
    )
    .option(
      "-e, --expiration-minutes <minutes>",
      "Positive integer token lifetime (default: 129600 minutes)",
      parseExpirationMinutes,
    )
    .option("--read", "Request a token with Packaging (Read) scope")
    .option("--no-read", "Request a token with Packaging (Read & Write)")
    .option("--force", "Force authentication token acquisition")
    .option("--no-force", "Do not force authentication token acquisition")
    .action(handleAuthCommandAsync);
}

type AuthCommandOptions = {
  readonly configPath?: string;
  readonly targetConfig?: string;
  readonly expirationMinutes?: number;
  readonly read?: boolean;
  readonly force?: boolean;
};

async function handleAuthCommandAsync(options: AuthCommandOptions, _: Command): Promise<void> {
  let spinnerPrompt: ReturnType<typeof prompts.spinner> | null = null;

  try {
    prompts.intro(`📦🔑 Welcome to ${packageName} ${packageVersion} 📦🔑`);
    if (isCI) {
      prompts.log.warn(
        `Automatic NPM registry authentication is not supported in CI environments. No authentication will be performed. Make sure you have configured authentication in your CI environment, or npm install will fail.`,
      );
      prompts.outro("Automatic authentication skipped.");
      process.exitCode = 0;
      return;
    }

    if (process.platform !== "win32") {
      prompts.log.warn(
        `Automatic NPM registry authentication is only supported on Windows. No authentication will be performed. Make sure you have manually configured authentication, or npm install will fail.`,
      );
      prompts.outro("Automatic authentication skipped.");
      process.exitCode = 0;
      return;
    }

    const authOptionsResult = await getAuthOptionsAsync(options);
    if (authOptionsResult.promptCancelled) {
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    const {
      configPaths,
      tokenScope: tokenScopeResult,
      forceOption: forceOptionResult,
    } = authOptionsResult;
    const registries: string[] = [];
    for (const configPath of configPaths) {
      const getRegistryResult = getRegistryFromConfigFile(configPath);
      if (getRegistryResult.type !== "registry-found") {
        const errorMessage = getRegistryErrorMessage(getRegistryResult);
        prompts.log.warn(`${errorMessage} Path: ${configPath}`);
        prompts.log.error(PromptMessages.AuthFailed);
        prompts.cancel(PromptMessages.Cancel);
        process.exitCode = 1;
        return;
      }

      registries.push(getRegistryResult.registry);
    }

    const registrySummary =
      registries.length === 1
        ? `registry at ${registries[0]}`
        : `registries at ${registries.join(", ")}`;
    prompts.log.info(
      `Attempting to authenticate with the Azure DevOps NPM ${registrySummary} (scope: ${tokenScopeResult.asFriendlyText}, force: ${forceOptionResult.asFriendlyText})`,
    );
    const credentialsDestination = getCredentialsDestination(options.targetConfig);
    let credentialsConfigurationFile: string;
    let credentialsSaveLocation: string;
    switch (credentialsDestination.type) {
      case "user-npm-configuration": {
        credentialsConfigurationFile = "the user's NPM configuration file";
        credentialsSaveLocation = `${credentialsConfigurationFile} at ~/.npmrc`;
        break;
      }
      case "target-npm-configuration": {
        credentialsConfigurationFile = `the NPM configuration file at ${credentialsDestination.path}`;
        credentialsSaveLocation = credentialsConfigurationFile;
        break;
      }
      default: {
        const never: never = credentialsDestination;
        throw new Error(`Unhandled credentials destination: ${JSON.stringify(never)}`);
      }
    }
    prompts.log.info(`Credentials will be saved to ${credentialsSaveLocation}`);
    spinnerPrompt = prompts.spinner();
    spinnerPrompt.start(`Authenticating`);
    const { vstsNpmAuthResult, retriedWithForce } = await runVstsNpmAuthWithRetryAsync(
      configPaths,
      tokenScopeResult.value,
      forceOptionResult.value,
      options.targetConfig,
      options.expirationMinutes,
      spinnerPrompt,
    );
    switch (vstsNpmAuthResult.type) {
      case "could-not-get-auth-token": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        prompts.log.warn("Failed to get an authentication token.");
        break;
      }
      case "already-have-credentials": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        prompts.log.info(`Valid credentials already exist in ${credentialsConfigurationFile}`);
        break;
      }
      case "credentials-obtained": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        const credentialsObtainedMessage = `New credentials were successfully obtained and written to ${credentialsConfigurationFile}`;
        const message = retriedWithForce
          ? `${credentialsObtainedMessage} (after retrying with forced token acquisition)`
          : credentialsObtainedMessage;
        prompts.log.info(message);
        break;
      }
      case "no-registry-entry-found": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        prompts.log.warn(`${PromptMessages.RegistryNotFound}.`);
        break;
      }
      case "config-file-not-found": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        prompts.log.warn(PromptMessages.ConfigFileNotFound);
        break;
      }
      case "credentials-not-required": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        prompts.log.warn(
          "The registry in the NPM configuration file doesn't require authentication",
        );
        break;
      }
      case "unknown": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        if (vstsNpmAuthResult.output.length > 0) {
          for (const line of vstsNpmAuthResult.output) {
            prompts.log.info(line);
          }
        }
        break;
      }
      default: {
        const never: never = vstsNpmAuthResult;
        throw new Error(`Unhandled result type: ${JSON.stringify(never)}`);
      }
    }

    if (!isVstsNpmAuthSuccessful(vstsNpmAuthResult)) {
      prompts.log.error(PromptMessages.AuthFailed);
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    prompts.log.success("Authentication with Azure DevOps NPM registry completed successfully 😊");
    prompts.outro(`📦🔑 Thanks for using ${packageName} ${packageVersion} 📦🔑`);
    process.exitCode = 0;
  } catch (error) {
    spinnerPrompt?.stop(PromptMessages.AuthAttemptFinished);
    const errorMessage = getErrorMessage(error);
    prompts.log.error(errorMessage);
    prompts.cancel(PromptMessages.Cancel);
    process.exitCode = 1;
  }
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

function parseExpirationMinutes(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidArgumentError("Expiration minutes must be a positive integer.");
  }

  const expirationMinutes = Number(value);
  if (!Number.isSafeInteger(expirationMinutes)) {
    throw new InvalidArgumentError("Expiration minutes must be a safe positive integer.");
  }

  return expirationMinutes;
}

type CredentialsDestination =
  | {
      readonly type: "user-npm-configuration";
    }
  | {
      readonly type: "target-npm-configuration";
      readonly path: string;
    };

function getCredentialsDestination(targetConfig: string | undefined): CredentialsDestination {
  if (typeof targetConfig === "undefined") {
    return { type: "user-npm-configuration" };
  }

  return {
    type: "target-npm-configuration",
    path: targetConfig,
  };
}

type VstsNpmAuthWithRetryResult = {
  readonly vstsNpmAuthResult: VstsNpmAuthResult;
  readonly retriedWithForce: boolean;
};

async function runVstsNpmAuthWithRetryAsync(
  configPaths: readonly string[],
  tokenScope: TokenScope,
  forceOption: ForceAcquisitionOption,
  targetConfig: string | undefined,
  expirationMinutes: number | undefined,
  spinnerPrompt: ReturnType<typeof prompts.spinner>,
): Promise<VstsNpmAuthWithRetryResult> {
  const vstsNpmAuthOptions: VstsNpmAuthOptions = {
    config: configPaths,
    targetConfig,
    expirationMinutes,
    readOnly: tokenScope === "read",
    force: forceOption === "force-acquisition",
  };
  let vstsNpmAuthResult = await runVstsNpmAuthAsync(vstsNpmAuthOptions);
  let retriedWithForce = false;
  if (vstsNpmAuthResult.type === "could-not-get-auth-token" && !vstsNpmAuthOptions.force) {
    spinnerPrompt.message("Retrying with forced token acquisition");
    retriedWithForce = true;
    vstsNpmAuthResult = await runVstsNpmAuthAsync({
      ...vstsNpmAuthOptions,
      force: true,
    });
  }
  return { vstsNpmAuthResult, retriedWithForce };
}
