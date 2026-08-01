import * as prompts from "@clack/prompts";

// Re-export prompts so every prompt import uses the same project convention.
export { prompts };

export class PromptMessages {
  public static readonly ConfigurationAttemptFinished = "NPM auth configuration attempt finished";
  public static readonly Cancel =
    "Operation failed. No files were changed. Exiting - maybe another time? 👋";
  public static readonly CancelMayBePartial =
    "Operation failed. Configuration may be partially applied. Review the project files before retrying. Exiting - maybe another time? 👋";
  public static readonly NoFilesChanged = "No files were changed.";
}
