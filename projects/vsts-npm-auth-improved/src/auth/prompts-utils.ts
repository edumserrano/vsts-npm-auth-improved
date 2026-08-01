import * as prompts from "@clack/prompts";

// Re-export prompts for use in other modules, whenever I type prompts I want the IDE auto-suggest this import.
// Without this re-export the IDE doesn't suggest any import because it has no way of knowing that I want to threat
// the "@clack/prompts" module as "prompts".
export { prompts };

export class PromptMessages {
  public static readonly Cancel = "Operation failed. Exiting - maybe another time? 👋";
  public static readonly AuthFailed = "Authentication with Azure DevOps NPM registry failed. 😞";
  public static readonly AuthAttemptFinished = "Authentication attempt finished";
  public static readonly ConfigFileNotFound =
    "NPM configuration file not found. Is the filepath correct?";
  public static readonly RegistryNotFound = "No registry entry found in the NPM configuration file";
}
