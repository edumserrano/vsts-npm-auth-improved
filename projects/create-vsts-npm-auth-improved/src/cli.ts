import { Command, CommanderError } from "commander";
import { addInitAuthCommand } from "./init-auth/init-auth-command";
import { packageVersion } from "./package-metadata";

export async function cliAsync(argv: string[]): Promise<void> {
  try {
    console.log(); // Add a blank line before any CLI output for better readability
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
    .exitOverride() // See /projects/create-vsts-npm-auth-improved/tests/README.md
    .name("create-vsts-npm-auth-improved")
    .description("Configure projects to use vsts-npm-auth-improved.")
    .version(packageVersion, "-v, --version")
    .addHelpText(
      "after",
      `
Examples:
  $ create-vsts-npm-auth-improved
  $ create-vsts-npm-auth-improved init-auth
`,
    );
  addInitAuthCommand(program);
  return program;
}

function isCommanderError(error: unknown): error is CommanderError {
  return error instanceof CommanderError;
}
