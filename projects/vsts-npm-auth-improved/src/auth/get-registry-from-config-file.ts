import { readFileSync } from "node:fs";
import { parse } from "ini";
import { PromptMessages } from "./prompts-utils.js";

type GetRegistryResult = RegistryFoundResult | GetRegistryErrorResult;

export type GetRegistryErrorResult = RegistryNotFoundResult | ConfigurationFileNotFoundResult;

type RegistryFoundResult = {
  readonly type: "registry-found";
  readonly registry: string;
};
type RegistryNotFoundResult = {
  readonly type: "registry-not-found";
};
type ConfigurationFileNotFoundResult = {
  readonly type: "configuration-file-not-found";
};

export function getRegistryFromConfigFile(configPath: string): GetRegistryResult {
  try {
    const npmrcFileContents = readFileSync(configPath, { encoding: "utf-8" });
    const npmrc = parse(npmrcFileContents);
    if (typeof npmrc.registry !== "string" || npmrc.registry.trim() === "") {
      return { type: "registry-not-found" };
    }

    return { type: "registry-found", registry: npmrc.registry };
  } catch {
    return { type: "configuration-file-not-found" };
  }
}

export function getRegistryErrorMessage(result: GetRegistryErrorResult): string {
  switch (result.type) {
    case "configuration-file-not-found":
      return PromptMessages.ConfigFileNotFound;
    case "registry-not-found":
      return PromptMessages.RegistryNotFound;
    default: {
      const never: never = result;
      throw new Error(`Unhandled GetRegistryResult.type: ${JSON.stringify(never)}`);
    }
  }
}
