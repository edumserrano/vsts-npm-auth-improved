import { Buffer } from "node:buffer";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

/**
 * Captures writes to process output streams. It supplies normalized terminal
 * output for complete scenario snapshots. Normalization removes terminal
 * controls, transport-only blank lines, and release-specific package versions.
 * It keeps the visible CLI content.
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
 * Replaces `process.stdout.write` with a Vitest spy. The spy suppresses terminal
 * output. Its `normalizedOutput` property calculates and supplies captured text
 * when a test reads the property.
 */
export function mockStdoutWrite(): OutputWriteFunctionMock {
  return mockStreamWrite(process.stdout, lineFeed);
}

/**
 * Replaces `process.stderr.write` with a Vitest spy. The spy suppresses terminal
 * output. Its `normalizedOutput` property calculates and supplies captured text
 * when a test reads the property.
 */
export function mockStderrWrite(): OutputWriteFunctionMock {
  return mockStreamWrite(process.stderr);
}

/**
 * Creates a normalized write spy for a process output stream. The optional
 * prefix keeps the initial newline that stdout snapshots use.
 */
function mockStreamWrite(
  stream: NodeJS.WriteStream,
  normalizedOutputPrefix = "",
): OutputWriteFunctionMock {
  const mock: MockInstance<StreamWriteFunction> = vi
    .spyOn(stream, "write")
    .mockImplementation(() => true);
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
 * Collects text and byte writes from an output spy. It normalizes newlines and
 * removes terminal controls and transport-only blank lines. It joins visible
 * lines and replaces the package version with a stable placeholder.
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
  const normalizedOutput = joinSoftWrappedPromptLines(normalizedLines)
    .filter(outputEntry => outputEntry.trim() !== "")
    .join(lineFeed);
  const prefixedOutput = prefix + normalizedOutput;
  return normalizePackageVersion(prefixedOutput);
}

/**
 * Joins lines that Clack wraps to the active terminal width. A space at the end
 * of the preceding line identifies a soft line break.
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
 * Determines if two adjacent lines belong to one prompt. It also makes sure
 * that a soft line break ends the preceding line.
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
 * Converts each Node.js stream-write input form into UTF-8 text.
 */
function toText(chunk: string | Uint8Array): string {
  return typeof chunk === "string"
    ? chunk
    : Buffer.from(chunk).toString();
}

/**
 * Removes ANSI control sequences and other nonprinting control characters. It
 * keeps visible terminal text and line feeds.
 */
function stripTerminalControlSequences(value: string): string {
  return value
    .replace(operatingSystemCommandPattern, "")
    .replace(controlSequenceIntroducerPattern, "")
    .replace(characterSetSelectionPattern, "")
    .replace(remainingControlCharactersPattern, "");
}

/**
 * Replaces semantic versions after the package name or on a separate line.
 * Thus, a package version change does not change snapshots.
 */
function normalizePackageVersion(output: string): string {
  return output
    .replace(packageVersionAfterName, `$1${packageVersionPlaceholder}`)
    .replace(standalonePackageVersion, packageVersionPlaceholder);
}
