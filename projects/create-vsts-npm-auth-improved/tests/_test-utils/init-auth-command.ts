import { cliAsync } from "@create-vsts-npm-auth-improved";

/**
 * Provides the typed source-test entry points for the public create CLI. It
 * constructs normal Commander argv for default and explicit init-auth
 * invocations and is the only source helper that imports production cliAsync.
 */

export class CreateVstsNpmAuthImprovedCli {
  static async invokeAsync(argv: string[] = []): Promise<void> {
    await cliAsync(["node", "main.js", ...argv]);
  }
}

export type InitAuthInvocation = "default" | "explicit";

export type InitAuthCommandOptions = {
  readonly invocation?: InitAuthInvocation;
};

export class InitAuthCommand {
  static async invokeAsync(
    options: InitAuthCommandOptions = {},
  ): Promise<void> {
    const args =
      (options.invocation ?? "default") === "explicit" ? ["init-auth"] : [];
    await CreateVstsNpmAuthImprovedCli.invokeAsync(args);
  }
}
