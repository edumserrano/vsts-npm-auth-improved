import { Command } from "commander";
import {
  isVstsNpmAuthSuccessful,
  runVstsNpmAuthAsync,
  VstsNpmAuthOptions,
  VstsNpmAuthResult,
} from "./vsts-npm-auth";
import { PromptMessages, prompts } from "./prompts-utils";
import { packageName, packageVersion } from "../package-json-utils";
import { ForceAcquisitionOption, getAuthOptionsAsync, TokenScope } from "./get-auth-options";
import {
  getRegistryErrorMessage,
  getRegistryFromConfigFile,
} from "./get-registry-from-config-file";

export function addAuthCommand(program: Command): Command {
  return program
    .command("auth", { isDefault: true })
    .description("Authenticate on Windows using vsts-npm-auth NPM package")
    .option("-c, --config-path <path>", "Path to the .npmrc config file")
    .option("--read", "Request a token with Packaging (Read) scope")
    .option("--no-read", "Request a token with Packaging (Read & Write)")
    .option("--force", "Force authentication token acquisition")
    .option("--no-force", "Do not force authentication token acquisition")
    .action(handleAuthCommandAsync);
}

type AuthCommandOptions = {
  readonly configPath?: string;
  readonly read?: boolean;
  readonly force?: boolean;
};

async function handleAuthCommandAsync(options: AuthCommandOptions, _: Command): Promise<void> {
  let spinnerPrompt: ReturnType<typeof prompts.spinner> | null = null;

  try {
    prompts.intro(`📦🔑 Welcome to ${packageName} ${packageVersion} 📦🔑`);
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
      configPath: configPathResult,
      tokenScope: tokenScopeResult,
      forceOption: forceOptionResult,
    } = authOptionsResult;
    const getRegistryResult = getRegistryFromConfigFile(configPathResult);
    if (getRegistryResult.type !== "registry-found") {
      const errorMessage = getRegistryErrorMessage(getRegistryResult);
      prompts.log.warn(errorMessage);
      prompts.log.error(PromptMessages.AuthFailed);
      prompts.cancel(PromptMessages.Cancel);
      process.exitCode = 1;
      return;
    }

    prompts.log.info(
      `Attempting to authenticate with the Azure DevOps NPM registry at ${getRegistryResult.registry} (scope: ${tokenScopeResult.asFriendlyText}, force: ${forceOptionResult.asFriendlyText})`,
    );
    prompts.log.info(`Credentials will be saved to the user's NPM configuration file at ~/.npmrc`);
    spinnerPrompt = prompts.spinner();
    spinnerPrompt.start(`Authenticating`);
    const { vstsNpmAuthResult, retriedWithForce } = await runVstsNpmAuthWithRetryAsync(
      configPathResult,
      tokenScopeResult.value,
      forceOptionResult.value,
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
        prompts.log.info("Valid credentials already exist in the user's NPM configuration file");
        break;
      }
      case "credentials-obtained": {
        spinnerPrompt.stop(PromptMessages.AuthAttemptFinished);
        const credentialsObtainedMessage =
          "New credentials were successfully obtained and written to the user's NPM configuration file";
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

type VstsNpmAuthWithRetryResult = {
  readonly vstsNpmAuthResult: VstsNpmAuthResult;
  readonly retriedWithForce: boolean;
};

async function runVstsNpmAuthWithRetryAsync(
  configPath: string,
  tokenScope: TokenScope,
  forceOption: ForceAcquisitionOption,
  spinnerPrompt: ReturnType<typeof prompts.spinner>,
): Promise<VstsNpmAuthWithRetryResult> {
  const vstsNpmAuthOptions: VstsNpmAuthOptions = {
    config: [configPath],
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
