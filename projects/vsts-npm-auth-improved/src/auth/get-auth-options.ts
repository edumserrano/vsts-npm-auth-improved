import { prompts } from "./prompts-utils.js";
import {
  getRegistryErrorMessage,
  getRegistryFromConfigFile,
} from "./get-registry-from-config-file.js";

const TOKEN_SCOPE = {
  READ: "read",
  READ_WRITE: "read-write",
} as const;

export type TokenScope = (typeof TOKEN_SCOPE)[keyof typeof TOKEN_SCOPE];

const FORCE_ACQUISITION_OPTION = {
  NO_FORCE: "no-force-acquisition",
  FORCE: "force-acquisition",
} as const;

export type ForceAcquisitionOption =
  (typeof FORCE_ACQUISITION_OPTION)[keyof typeof FORCE_ACQUISITION_OPTION];

type PromptOption<T> = {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
};

type AuthOption<T> = {
  readonly value: T;
  readonly asFriendlyText?: string;
};

type GetAuthOptionsResult = GetAuthOptionsSuccess | GetAuthOptionsCancelled;

type GetAuthOptionsSuccess = {
  readonly promptCancelled: false;
  readonly configPaths: readonly string[];
  readonly tokenScope: AuthOption<TokenScope>;
  readonly forceOption: AuthOption<ForceAcquisitionOption>;
};

type GetAuthOptionsCancelled = {
  readonly promptCancelled: true;
};

type AuthCommandOptionsFromCli = {
  readonly configPath?: string;
  readonly read?: boolean;
  readonly force?: boolean;
};

export async function getAuthOptionsAsync(
  options: AuthCommandOptionsFromCli,
): Promise<GetAuthOptionsResult> {
  const configPaths = await getConfigPathsAsync(options);
  if (prompts.isCancel(configPaths)) {
    return { promptCancelled: true };
  }

  const tokenScope = await getTokenScopeAsync(options);
  if (prompts.isCancel(tokenScope)) {
    return { promptCancelled: true };
  }

  const forceOption = await getForceOptionAsync(options);
  if (prompts.isCancel(forceOption)) {
    return { promptCancelled: true };
  }

  return {
    promptCancelled: false,
    configPaths,
    tokenScope,
    forceOption,
  };
}

async function getConfigPathsAsync(
  options: AuthCommandOptionsFromCli,
): Promise<readonly string[] | symbol> {
  if (typeof options.configPath !== "undefined") {
    return parseConfigPaths(options.configPath);
  }

  const configPathPromptResult = await prompts.text({
    message: "Where is the NPM configuration file?",
    placeholder: "./.npmrc",
    initialValue: "./.npmrc",
    validate: value => {
      if (typeof value === "undefined") {
        return undefined; // valid, no validation error message displayed
      }

      const getRegistryResult = getRegistryFromConfigFile(value);
      if (getRegistryResult.type === "registry-found") {
        return undefined; // valid, no validation error message displayed
      }

      return getRegistryErrorMessage(getRegistryResult);
    },
  });
  if (prompts.isCancel(configPathPromptResult)) {
    return configPathPromptResult;
  }

  return [configPathPromptResult];
}

function parseConfigPaths(value: string): readonly string[] {
  const configPaths = value.split(",").map(configPath => configPath.trim());
  if (configPaths.some(configPath => configPath.length === 0)) {
    throw new Error("Config paths must be a comma-separated list with no empty paths.");
  }

  return configPaths;
}

const TOKEN_SCOPE_OPTIONS: PromptOption<TokenScope>[] = [
  {
    value: TOKEN_SCOPE.READ,
    label: "Packaging (Read)",
    hint: "Read packages",
  },
  {
    value: TOKEN_SCOPE.READ_WRITE,
    label: "Packaging (Read & Write)",
    hint: "Create, read, update and delete packages",
  },
];

async function getTokenScopeAsync(
  optionsFromCli: AuthCommandOptionsFromCli,
): Promise<AuthOption<TokenScope> | symbol> {
  if (typeof optionsFromCli.read !== "undefined") {
    const tokenScopeValueFromCli: TokenScope = optionsFromCli.read
      ? TOKEN_SCOPE.READ
      : TOKEN_SCOPE.READ_WRITE;
    const tokenScopePromptOption = getTokenScopePromptOption(tokenScopeValueFromCli);
    return { value: tokenScopeValueFromCli, asFriendlyText: tokenScopePromptOption.label };
  }

  const tokenScopePromptResult = await prompts.select({
    message: "What kind scope should be used for the auth token?",
    options: TOKEN_SCOPE_OPTIONS,
  });
  if (prompts.isCancel(tokenScopePromptResult)) {
    return tokenScopePromptResult;
  }

  const tokenScopePromptOption = getTokenScopePromptOption(tokenScopePromptResult);
  return { value: tokenScopePromptOption.value, asFriendlyText: tokenScopePromptOption.label };
}

function getTokenScopePromptOption(value: TokenScope): PromptOption<TokenScope> {
  const tokenScope = TOKEN_SCOPE_OPTIONS.find(opt => opt.value === value);
  if (typeof tokenScope === "undefined") {
    throw new Error(`Failed to find TokenScope option for value: ${value}`);
  }

  return tokenScope;
}

const FORCE_OPTION_OPTIONS: PromptOption<ForceAcquisitionOption>[] = [
  { value: FORCE_ACQUISITION_OPTION.NO_FORCE, label: "no" },
  {
    value: FORCE_ACQUISITION_OPTION.FORCE,
    label: "yes",
    hint: "Only use this if the authentication fails without force token acquisition.",
  },
];

async function getForceOptionAsync(
  optionsFromCli: AuthCommandOptionsFromCli,
): Promise<AuthOption<ForceAcquisitionOption> | symbol> {
  if (typeof optionsFromCli.force !== "undefined") {
    const forceOptionValueFromCli: ForceAcquisitionOption = optionsFromCli.force
      ? FORCE_ACQUISITION_OPTION.FORCE
      : FORCE_ACQUISITION_OPTION.NO_FORCE;
    const forceOptionPromptOption = getForcePromptOption(forceOptionValueFromCli);
    return { value: forceOptionValueFromCli, asFriendlyText: forceOptionPromptOption.label };
  }

  const forceOptionPromptResult = await prompts.select({
    message: "Force token acquisition?",
    options: FORCE_OPTION_OPTIONS,
  });
  if (prompts.isCancel(forceOptionPromptResult)) {
    return forceOptionPromptResult;
  }

  const forceOptionPromptOption = getForcePromptOption(forceOptionPromptResult);
  return { value: forceOptionPromptOption.value, asFriendlyText: forceOptionPromptOption.label };
}

function getForcePromptOption(value: ForceAcquisitionOption): PromptOption<ForceAcquisitionOption> {
  const forceOption = FORCE_OPTION_OPTIONS.find(opt => opt.value === value);
  if (typeof forceOption === "undefined") {
    throw new Error(`Failed to find ForceAcquisitionOption option for value: ${value}`);
  }

  return forceOption;
}
