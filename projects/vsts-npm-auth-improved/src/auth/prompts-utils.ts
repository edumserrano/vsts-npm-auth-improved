import * as prompts from "@clack/prompts";

// Re-export prompts to give all modules the same import name. This re-export
// also lets the IDE suggest the "prompts" name for "@clack/prompts".
export { prompts };

export class PromptMessages {
  public static readonly Cancel = "Operation failed. Exiting - maybe another time? 👋";
  public static readonly AuthFailed = "Authentication with Azure DevOps NPM registry failed. 😞";
  public static readonly AuthAttemptFinished = "Authentication attempt finished";
  public static readonly ConfigFileNotFound =
    "NPM configuration file not found. Is the filepath correct?";
  public static readonly RegistryNotFound = "No registry entry found in the NPM configuration file";
}
