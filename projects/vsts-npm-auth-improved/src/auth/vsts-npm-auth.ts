import { execa } from "execa";

export type VstsNpmAuthVerbosity = "silent" | "quiet" | "normal" | "detailed";

// Refer to https://www.npmjs.com/package/vsts-npm-auth.
export type VstsNpmAuthOptions = {
  /** Shows help. */
  readonly help?: boolean;
  /** Prevents interactive credential prompts. */
  readonly nonInteractive?: boolean;
  /** Required paths to npm configuration files that contain package sources. */
  readonly config: readonly string[];
  /** npm configuration file that receives the generated tokens. */
  readonly targetConfig?: string;
  /** Token life in minutes. The default is 129600. */
  readonly expirationMinutes?: number;
  /** Requests a read-only token. The default is false. */
  readonly readOnly?: boolean;
  /** Gets a token even when a valid token exists. The default is false. */
  readonly force?: boolean;
  /** Sets the amount of detail in the output. */
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

/** The credentials exist and are valid. */
export type AlreadyHaveCredentialsResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "already-have-credentials";
};

/** The command got new credentials. */
export type CredentialsObtainedResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "credentials-obtained";
};

/** The command did not get an authentication token. */
export type CouldNotGetAuthTokenResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "could-not-get-auth-token";
};

/** The config file does not contain a registry entry. */
export type NoRegistryEntryResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "no-registry-entry-found";
};

/** The command did not find the config file. */
export type ConfigFileNotFoundResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "config-file-not-found";
};

/** The registry probe returned 200 without credentials. */
export type CredentialsNotRequiredResult = VstsNpmAuthCommonResultOptions & {
  readonly type: "credentials-not-required";
};

/** The result type is unknown. */
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
    lines: true, // Return string[] output instead of one string with newlines.
    all: true, // Combine stdout and stderr in the result.all property.
    // Do not throw an exception for a nonzero exit code. Examine result.exitCode
    // or result.failed when necessary.
    reject: false,
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
  // Always remove the first three lines of vsts-npm-auth output.
  //
  // Example output lines:
  //
  // '',
  // 'vsts-npm-auth v0.43.0.0 ',
  // '-----------------------',
  // "Config file not found. File name: './.npmrc'"
  //
  // The first three lines contain only header information.
  // The result information starts on line 4.
  return output.slice(3);
}

/**
 * Maps output patterns to result types.
 * The first matching pattern sets the result.
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
