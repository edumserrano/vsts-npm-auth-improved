import { Command, CommanderError } from "commander";
import { addAuthCommand } from "./auth/auth-command.js";
import { packageVersion } from "./package-json-utils.js";

export async function cliAsync(argv: string[]): Promise<void> {
  try {
    console.log(); // Add a blank line to make the CLI output easy to read.
    const program = createProgram();
    await program.parseAsync(argv);
  } catch (error) {
    if (isCommanderError(error)) {
      process.exitCode = error.exitCode;
      return;
    }

    console.log("🚨 Unexpected error:", error);
    process.exitCode = 1;
    return;
  }
}

function createProgram(): Command {
  const program = new Command();
  program
    .exitOverride() // Refer to /projects/vsts-npm-auth-improved/tests/README.md.
    .name("vsts-npm-auth-improved")
    .description("Authenticates with Azure DevOps NPM registry.")
    .version(packageVersion, "-v, --version")
    .addHelpText(
      "after",
      `
Examples:
  $ vsts-npm-auth-improved
  $ vsts-npm-auth-improved init
  $ vsts-npm-auth-improved auth
  $ vsts-npm-auth-improved auth --config-path ~/.npmrc --force-refresh
  $ vsts-npm-auth-improved auth --config-path ~/.npmrc --write-token
`,
    );
  addAuthCommand(program);
  return program;
}

function isCommanderError(error: unknown): error is CommanderError {
  return error instanceof CommanderError;
}
