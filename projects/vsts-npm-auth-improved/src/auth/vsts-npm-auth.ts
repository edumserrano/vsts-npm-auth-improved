import { execa } from "execa";

export type VstsNpmAuthVerbosity = "silent" | "quiet" | "normal" | "detailed";

// See https://www.npmjs.com/package/vsts-npm-auth
export type VstsNpmAuthOptions = {
  /** Shows help */
  readonly help?: boolean;
  /** Don't allow interactively prompting for credentials to obtain a token */
  readonly nonInteractive?: boolean;
  /** REQUIRED: List of paths to npm configuration file containing package sources to acquire authentication tokens for */
  readonly config: readonly string[];
  /** npm configuration file to write the generated tokens to */
  readonly targetConfig?: string;
  /** Minutes until acquired tokens should expire. Default: 129600 */
  readonly expirationMinutes?: number;
  /** Request a read-only token. Default: false */
  readonly readOnly?: boolean;
  /** Force token acquisition. Default: false */
  readonly force?: boolean;
  /** Display this amount of detail in the output */
  readonly verbosity?: VstsNpmAuthVerbosity;
};

// Already have credentials for <registry-url>.
// Getting new credentials for source:<registry-url>, scope:vso.packaging
// Couldn't get an authentication token for <registry-url>.
// No registry entries were found in the supplied config files -- when used with an npmrc that doesn't have a registry
// Config file not found. File name: '.\.npmrc'

// Probing <registry-url> with existing credential
// Probe response code: 401 Unauthorized
// Credential type: Unknown.
// Has valid credentials: False.
// Couldn't get an authentication token for <registry-url>.

// 'Probing https://registry.npmjs.org/',
// 'Probe response code: 200 OK',
// 'Credential type: None.'

export function isVstsNpmAuthSuccessful(result: VstsNpmAuthResult): boolean {
  return result.type === "already-have-credentials" || result.type === "credentials-obtained";
}

export type VstsNpmAuthCommonResultOptions = {
  readonly output: readonly string[];
};

/** Credentials already exist and are valid */
export type AlreadyHaveCredentialsResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "already-have-credentials";
};

/** New credentials were successfully obtained */
export type CredentialsObtainedResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "credentials-obtained";
};

/** Failed to get authentication token */
export type CouldNotGetAuthTokenResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "could-not-get-auth-token";
};

/** No registry entry found in the config file */
export type NoRegistryEntryResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "no-registry-entry-found";
};

/** Config file not found */
export type ConfigFileNotFoundResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "config-file-not-found";
};

/** Credentials not required, was able to probe the registry without auth and got a 200 back */
export type CredentialsNotRequiredResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "credentials-not-required";
};

/** Unknown result type */
export type UnknownResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "unknown";
};

export type VstsNpmAuthResult =
  | AlreadyHaveCredentialsResult
  | CredentialsObtainedResult
  | CouldNotGetAuthTokenResult
  | NoRegistryEntryResult
  | ConfigFileNotFoundResult
  | CredentialsNotRequiredResult
  | UnknownResult;

export async function runVstsNpmAuthAsync(options: VstsNpmAuthOptions): Promise<VstsNpmAuthResult> {
  const vstsNpmAuthArgs = buildArgs(options);
  const npxArgs = [
    "--yes",
    "--registry=https://registry.npmjs.org/",
    "vsts-npm-auth@latest",
    ...vstsNpmAuthArgs,
  ];
  const result = await execa("npx", npxArgs, {
    lines: true, // provide output as a string[] instead of a single string with newlines
    all: true, // combine both stdout and stderr into the result.all property
    reject: false, // don't throw an exception when the executed action returns non-zero exit codes, if needed check result.exitCode or result.failed
  });
  return parseResult(result.all);
}

function buildArgs(options: VstsNpmAuthOptions): string[] {
  const args: string[] = [];

  if (options.help) {
    args.push("-?");
  }

  if (options.nonInteractive) {
    args.push("-N");
  }

  if (options.config && options.config.length > 0) {
    args.push("-C", options.config.join(","));
  }

  if (options.targetConfig) {
    args.push("-T", options.targetConfig);
  }

  if (options.expirationMinutes !== undefined) {
    args.push("-E", options.expirationMinutes.toString());
  }

  if (options.readOnly) {
    args.push("-R");
  }

  if (options.force) {
    args.push("-F");
  }

  if (options.verbosity) {
    args.push("-V", options.verbosity);
  }

  return args;
}

function removeHeadersFromOutput(output: readonly string[]): readonly string[] {
  // Always remove the first 3 lines of vsts-npm-auth output.
  //
  // Example output lines:
  //
  // '',
  // 'vsts-npm-auth v0.43.0.0 ',
  // '-----------------------',
  // "Config file not found. File name: './.npmrc'"
  //
  // The first three lines are just header information.
  // The actual useful output starts from line 4.
  return output.slice(3);
}

/**
 * Mapping of output patterns to their corresponding result types.
 * Order matters - first match wins.
 */
type VstsNpmAuthOutputPattern = {
  readonly pattern: string;
  readonly type: VstsNpmAuthResult["type"];
};

const OUTPUT_PATTERN_TO_RESULT_TYPE: readonly VstsNpmAuthOutputPattern[] = [
  { pattern: "Already have credentials for", type: "already-have-credentials" },
  { pattern: "Couldn't get an authentication token for", type: "could-not-get-auth-token" },
  {
    pattern: "No registry entries were found in the supplied config files",
    type: "no-registry-entry-found",
  },
  { pattern: "Config file not found", type: "config-file-not-found" },
  { pattern: "Getting new credentials for", type: "credentials-obtained" },
];

function parseResult(outputLines: readonly string[]): VstsNpmAuthResult {
  const outputLinesWithoutHeaders = removeHeadersFromOutput(outputLines ?? []);
  const outputText = outputLinesWithoutHeaders.join("\n");

  if (outputLinesWithoutHeaders.length === 0) {
    return {
      type: "credentials-not-required",
      output: ["Credential type: None."],
    };
  }

  const matchedPattern = OUTPUT_PATTERN_TO_RESULT_TYPE.find(({ pattern }) =>
    outputText.includes(pattern),
  );

  if (matchedPattern) {
    return {
      type: matchedPattern.type,
      output: outputLinesWithoutHeaders,
    };
  }

  return {
    type: "unknown",
    output: outputLinesWithoutHeaders,
  };
}
