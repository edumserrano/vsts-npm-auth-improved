import { Buffer } from "node:buffer";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

/**
 * Captures writes to process output streams and exposes normalized terminal
 * output for complete scenario snapshots. Normalization removes terminal
 * control formatting, transport-only blank lines, and release-specific package
 * versions while preserving the CLI's visible content.
 */

type StreamWriteFunction = typeof process.stdout.write;

const packageVersionPlaceholder = "<PACKAGE_VERSION>";
const numericVersionIdentifierPattern = String.raw`(?:0|[1-9]\d*)`;
const nonNumericPrereleaseIdentifierPattern =
  String.raw`\d*[A-Za-z-][0-9A-Za-z-]*`;
const prereleaseIdentifierPattern =
  `(?:${numericVersionIdentifierPattern}|${nonNumericPrereleaseIdentifierPattern})`;
const prereleasePattern = String.raw`(?:-${prereleaseIdentifierPattern}(?:\.${prereleaseIdentifierPattern})*)?`;
const buildIdentifierPattern = String.raw`[0-9A-Za-z-]+`;
const buildMetadataPattern = String.raw`(?:\+${buildIdentifierPattern}(?:\.${buildIdentifierPattern})*)?`;
const semanticVersionPattern = String.raw`${numericVersionIdentifierPattern}\.${numericVersionIdentifierPattern}\.${numericVersionIdentifierPattern}${prereleasePattern}${buildMetadataPattern}`;
const packageNamePattern = String.raw`vsts-npm-auth-improved`;
const packageVersionTerminatorPattern = String.raw`(?![0-9A-Za-z.+-])`;
const packageVersionAfterName = new RegExp(
  `(${packageNamePattern} )${semanticVersionPattern}${packageVersionTerminatorPattern}`,
  "g",
);
const standalonePackageVersion = new RegExp(`^${semanticVersionPattern}$`, "gm");
const carriageReturn = "\r";
const lineFeed = "\n";
const unicodeLineSeparator = "\u2028";
const unicodeParagraphSeparator = "\u2029";
const newlinePattern = new RegExp(
  `${carriageReturn}${lineFeed}?|${unicodeLineSeparator}|${unicodeParagraphSeparator}`,
  "g",
);
const operatingSystemCommandPattern =
  /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const controlSequenceIntroducerPattern = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const characterSetSelectionPattern = /\u001b[()][0-2A-Z0-9]/g;
const remainingControlCharactersPattern =
  /[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g;
const promptGuidePrefixPattern = /^[│|] {2}/;

export type OutputWriteFunctionMock = MockInstance<StreamWriteFunction> & {
  readonly normalizedOutput: string;
};

/**
 * Replaces `process.stdout.write` with a Vitest spy that suppresses terminal
 * output and exposes the captured text through a lazily evaluated,
 * snapshot-friendly `normalizedOutput` property.
 */
export function mockStdoutWrite(): OutputWriteFunctionMock {
  return mockStreamWrite(process.stdout, lineFeed);
}

/**
 * Replaces `process.stderr.write` with a Vitest spy that suppresses terminal
 * output and exposes the captured text through a lazily evaluated,
 * snapshot-friendly `normalizedOutput` property.
 */
export function mockStderrWrite(): OutputWriteFunctionMock {
  return mockStreamWrite(process.stderr);
}

/**
 * Creates a normalized write spy for either process output stream. The optional
 * prefix preserves the historical leading newline used by stdout snapshots.
 */
function mockStreamWrite(
  stream: NodeJS.WriteStream,
  normalizedOutputPrefix = "",
): OutputWriteFunctionMock {
  const mock: MockInstance<StreamWriteFunction> = vi.spyOn(stream, "write");
  mock.mockImplementation(() => true);
  const augmentedMock = mock as OutputWriteFunctionMock;
  Object.defineProperty(augmentedMock, "normalizedOutput", {
    get() {
      return normalizeOutput(this, normalizedOutputPrefix);
    },
    configurable: true,
  });
  return augmentedMock;
}

/**
 * Collects text and byte writes from an output spy, normalizes newlines, removes
 * terminal control sequences and transport-only blank lines, joins the visible
 * lines, and replaces the package version with a stable placeholder.
 */
function normalizeOutput(
  outputWriteFunctionMock: MockInstance<StreamWriteFunction>,
  prefix: string,
): string {
  const outputs = outputWriteFunctionMock.mock.calls.map(([chunk]) =>
    toText(chunk),
  );
  if (outputs.length === 0) {
    return "";
  }

  const normalizedLines = outputs.flatMap(outputEntry => {
    let normalizedEntry = outputEntry.replace(newlinePattern, lineFeed);
    normalizedEntry = stripTerminalControlSequences(normalizedEntry);
    return normalizedEntry.split(lineFeed);
  });
  const joinedLines = joinSoftWrappedPromptLines(normalizedLines);
  const linesWithVisibleText = joinedLines.filter(hasVisibleText);
  const normalizedOutput = linesWithVisibleText.join(lineFeed);
  const prefixedOutput = prefix + normalizedOutput;
  return normalizePackageVersion(prefixedOutput);
}

/** Tests whether a normalized output line contains non-whitespace text. */
function hasVisibleText(value: string): boolean {
  return value.trim() !== "";
}

/**
 * Rejoins lines that Clack soft-wraps to the active terminal width. A trailing
 * space on the preceding line marks the location of the soft line break.
 */
function joinSoftWrappedPromptLines(lines: readonly string[]): string[] {
  const joinedLines: string[] = [];
  for (const line of lines) {
    const previousLineIndex = joinedLines.length - 1;
    const previousLine = joinedLines[previousLineIndex];
    const guidePrefix = line.match(promptGuidePrefixPattern)?.[0];
    if (previousLine === undefined || guidePrefix === undefined) {
      joinedLines.push(line);
      continue;
    }

    const lineContinuesPreviousPrompt = isSoftWrappedPromptContinuation(
      previousLine,
      guidePrefix,
    );

    if (lineContinuesPreviousPrompt) {
      joinedLines[previousLineIndex] = previousLine + line.slice(guidePrefix.length);
    } else {
      joinedLines.push(line);
    }
  }
  return joinedLines;
}

/**
 * Determines whether two adjacent lines belong to the same prompt and the
 * preceding line ends at a soft-wrap break space.
 */
function isSoftWrappedPromptContinuation(
  previousLine: string,
  guidePrefix: string,
): boolean {
  const belongsToSamePrompt = previousLine.startsWith(guidePrefix);
  if (!belongsToSamePrompt) {
    return false;
  }

  return previousLine.endsWith(" ");
}

/**
 * Converts either form accepted by a Node.js stream write into UTF-8 text for
 * normalization.
 */
function toText(chunk: string | Uint8Array): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  return Buffer.from(chunk).toString();
}

/**
 * Removes ANSI control-sequence families and remaining non-printing control
 * characters while leaving visible terminal text and line feeds intact.
 */
function stripTerminalControlSequences(value: string): string {
  let normalized = value.replace(operatingSystemCommandPattern, "");
  normalized = normalized.replace(controlSequenceIntroducerPattern, "");
  normalized = normalized.replace(characterSetSelectionPattern, "");
  normalized = normalized.replace(remainingControlCharactersPattern, "");
  return normalized;
}

/**
 * Replaces semantic versions shown after the package name or on their own line
 * so snapshots do not change when the package version changes.
 */
function normalizePackageVersion(output: string): string {
  let normalized = output.replace(
    packageVersionAfterName,
    `$1${packageVersionPlaceholder}`,
  );
  normalized = normalized.replace(
    standalonePackageVersion,
    packageVersionPlaceholder,
  );
  return normalized;
}
