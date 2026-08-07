import { cliAsync } from "@vsts-npm-auth-improved";

/**
 * Provides typed test entry points for the public CLI. It converts auth,
 * help, version, option, and prompt choices into normal Commander argv so
 * tests exercise production exclusively through cliAsync.
 */

export class VstsNpmAuthImprovedCli {
  static async invokeAsync(argv: string[] = []): Promise<void> {
    // The first two arguments are normally "node" and the script name/bin executable.
    // For testing purposes they can be anything, Commander doesn't validate them.
    const args = ["node", "main.js", ...argv];
    await cliAsync(args);
  }
}

type AuthCommandOptions = AuthOptions | HelpOptions | VersionOptions;

type FromCli<T> = {
  readonly from: "cli";
  readonly value: T;
  readonly useOptionAlias?: boolean;
};
type FromPrompt = { readonly from: "prompt" };

type AuthOptions = {
  readonly type: "auth";
  readonly configPath: FromCli<string> | FromPrompt;
  readonly nonInteractive?: FromCli<boolean>;
  readonly targetConfig?: FromCli<string>;
  readonly expirationMinutes?: FromCli<string | number>;
  readonly read: FromCli<boolean> | FromPrompt;
  readonly force: FromCli<boolean> | FromPrompt;
};

type HelpOptions = {
  readonly type: "help";
  readonly useOptionAlias?: boolean;
};

type VersionOptions = {
  readonly type: "version";
  readonly useOptionAlias?: boolean;
};

export class AuthCommand {
  static async invokeAsync(options: AuthCommandOptions): Promise<void> {
    const args = ["auth"];

    switch (options.type) {
      case "auth": {
        if (options.configPath.from === "cli") {
          args.push(
            options.configPath.useOptionAlias ? "-c" : "--config-path",
            options.configPath.value,
          );
        }

        if (options.nonInteractive?.from === "cli" && options.nonInteractive.value) {
          args.push(options.nonInteractive.useOptionAlias ? "-N" : "--non-interactive");
        }

        if (options.targetConfig?.from === "cli") {
          args.push(
            options.targetConfig.useOptionAlias ? "-T" : "--target-config",
            options.targetConfig.value,
          );
        }

        if (options.expirationMinutes?.from === "cli") {
          args.push(
            options.expirationMinutes.useOptionAlias ? "-E" : "--expiration-minutes",
            String(options.expirationMinutes.value),
          );
        }

        if (options.read.from === "cli") {
          args.push(options.read.value ? "--read" : "--no-read");
        }

        if (options.force.from === "cli") {
          args.push(options.force.value ? "--force" : "--no-force");
        }

        break;
      }
      case "help": {
        args.push(options.useOptionAlias ? "-h" : "--help");
        break;
      }
      case "version": {
        args.push(options.useOptionAlias ? "-v" : "--version");
        break;
      }
      default: {
        const never: never = options;
        throw new Error(`Unhandled options type: ${JSON.stringify(never)}`);
      }
    }

    await VstsNpmAuthImprovedCli.invokeAsync(args);
  }
}
