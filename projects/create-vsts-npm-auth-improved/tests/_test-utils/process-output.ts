import { Buffer } from "node:buffer";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

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
const packageNamePattern = String.raw`(?:create-)?vsts-npm-auth-improved`;
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
const windowsPathSeparator = "\\";
const normalizedPathSeparator = "/";
const temporaryRootPlaceholder = "<test-root>";
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
const nondeterministicSpinnerFramePattern =
  /^(?:◒|◐|◓|◑|•|o|O|0) {2}(?:Searching for package\.json files|Writing configuration files)\.\.\.\n?/gm;
const promptGuidePrefixPattern = /^[│|] {2}/;
const temporaryRootTypingSequencePattern = /(?:│  [^\n│]+?█)+/g;
const temporaryRootTypingFramePattern = /│  ([^\n│]+?)█/g;

/**
 * Captures stdout and optional stderr for complete terminal snapshots. It
 * normalizes terminal controls, variable spinner frames, test-owned absolute
 * paths, path separators, newlines, and release-specific package versions.
 */

type StreamWrite = typeof process.stdout.write;

export type OutputNormalizationOptions = {
  readonly temporaryRoots?: readonly string[];
};

export type OutputChannelCapture = {
  readonly normalizedOutput: string;
  readonly write: MockInstance<StreamWrite>;
};

export type ProcessOutputCapture = {
  readonly stdout: OutputChannelCapture;
  readonly stderr?: OutputChannelCapture;
};

export type ProcessOutputCaptureOptions = OutputNormalizationOptions & {
  readonly captureStderr?: boolean;
};

/**
 * Captures stdout and optional stderr with the same normalization options.
 * Thus, tests can verify complete process output without terminal writes.
 */
export function captureProcessOutput(
  options: ProcessOutputCaptureOptions = {},
): ProcessOutputCapture {
  return {
    stdout: captureOutputChannel(process.stdout, options),
    ...(options.captureStderr === true
      ? { stderr: captureOutputChannel(process.stderr, options) }
      : {}),
  };
}

/**
 * Replaces `process.stdout.write` with a capture. The capture supplies the write
 * spy and calculates normalized output when a test reads it.
 */
export function mockStdoutWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stdout, options);
}

/**
 * Replaces `process.stderr.write` with a capture. The capture supplies the write
 * spy and calculates normalized output when a test reads it.
 */
export function mockStderrWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stderr, options);
}

/**
 * Adds a spy to one process stream and suppresses its real writes. It returns a
 * getter that normalizes captured chunks with the specified options.
 */
function captureOutputChannel(
  stream: NodeJS.WriteStream,
  options: OutputNormalizationOptions,
): OutputChannelCapture {
  const write = vi.spyOn(stream, "write").mockImplementation(() => true);
  return {
    write,
    get normalizedOutput() {
      return normalizeOutput(write, options);
    },
  };
}

/**
 * Joins captured chunks. It removes platform, time, terminal, and release
 * differences. It keeps the CLI content that the tests verify.
 */
function normalizeOutput(
  write: MockInstance<StreamWrite>,
  options: OutputNormalizationOptions,
): string {
  const output = write.mock.calls
    .map(([chunk]) => toText(chunk))
    .join("");

  let normalized = output.replace(newlinePattern, lineFeed);
  normalized = stripTerminalControlSequences(normalized);
  normalized = stripNondeterministicSpinnerFrames(normalized);
  normalized = normalizeColorDrivenMultiselectRedraws(normalized);
  normalized = joinSoftWrappedPromptLines(normalized.split(lineFeed)).join(
    lineFeed,
  );

  const normalizedTemporaryRoots = [...(options.temporaryRoots ?? [])]
    .map(normalizePathSeparators)
    .sort((left, right) => right.length - left.length);

  normalized = normalizePathSeparators(normalized);
  normalized = normalizeProgressivelyTypedTemporaryRoots(
    normalized,
    normalizedTemporaryRoots,
  );
  for (const temporaryRoot of normalizedTemporaryRoots) {
    normalized = replaceAllCaseInsensitive(
      normalized,
      temporaryRoot,
      temporaryRootPlaceholder,
    );
  }

  return normalizePackageVersion(normalized);
}

/**
 * Replaces semantic versions after each package name or on a separate line.
 * Thus, snapshots stay stable across releases.
 */
function normalizePackageVersion(output: string): string {
  return output
    .replace(packageVersionAfterName, `$1${packageVersionPlaceholder}`)
    .replace(standalonePackageVersion, packageVersionPlaceholder);
}

/**
 * Converts Windows path separators to the separator in cross-platform snapshots.
 */
function normalizePathSeparators(value: string): string {
  return value.replaceAll(windowsPathSeparator, normalizedPathSeparator);
}

/**
 * Replaces redraw frames for a known temporary root with one `<test-root>` frame.
 * A match requires the complete root in one sequence. Thus, unrelated absolute
 * input cannot match a common prefix such as `/` on Linux.
 */
function normalizeProgressivelyTypedTemporaryRoots(
  output: string,
  temporaryRoots: readonly string[],
): string {
  const normalizedTemporaryRootFrame = `│  ${temporaryRootPlaceholder}█`;
  const repeatedNormalizedTemporaryRootFrames = new RegExp(
    `(?:${escapeForRegExp(normalizedTemporaryRootFrame)})+`,
    "g",
  );
  return output.replace(
    temporaryRootTypingSequencePattern,
    typingSequence =>
      normalizeTemporaryRootTypingSequence(
        typingSequence,
        temporaryRoots,
        normalizedTemporaryRootFrame,
        repeatedNormalizedTemporaryRootFrames,
      ),
  );
}

/**
 * Normalizes a sequence of typed frames when it gets to a configured temporary
 * root. It does not change unrelated input.
 */
function normalizeTemporaryRootTypingSequence(
  typingSequence: string,
  temporaryRoots: readonly string[],
  normalizedTemporaryRootFrame: string,
  repeatedNormalizedTemporaryRootFrames: RegExp,
): string {
  const completedRoots = findCompletedTemporaryRoots(
    typingSequence,
    temporaryRoots,
  );
  if (completedRoots.length === 0) {
    return typingSequence;
  }

  return typingSequence
    .replace(
      temporaryRootTypingFramePattern,
      (originalFrame, typedValue: string) => {
        const belongsToCompletedRoot = completedRoots.some(root =>
          startsWithIgnoringCase(root, typedValue),
        );
        return belongsToCompletedRoot
          ? normalizedTemporaryRootFrame
          : originalFrame;
      },
    )
    .replace(
      repeatedNormalizedTemporaryRootFrames,
      normalizedTemporaryRootFrame,
    );
}

/**
 * Returns configured temporary roots that occur as complete values in a typed-frame sequence.
 */
function findCompletedTemporaryRoots(
  typingSequence: string,
  temporaryRoots: readonly string[],
): string[] {
  const typedValues = [
    ...typingSequence.matchAll(temporaryRootTypingFramePattern),
  ].map(([, typedValue]) => typedValue);

  return temporaryRoots.filter(root =>
    typedValues.some(typedValue => equalsIgnoringCase(typedValue, root)),
  );
}

/** Compares two strings without case differences. */
function equalsIgnoringCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Tests if a string starts with a prefix without case differences. */
function startsWithIgnoringCase(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
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
 * keeps visible terminal text.
 */
function stripTerminalControlSequences(value: string): string {
  return value
    .replace(operatingSystemCommandPattern, "")
    .replace(controlSequenceIntroducerPattern, "")
    .replace(characterSetSelectionPattern, "")
    .replace(remainingControlCharactersPattern, "");
}

/**
 * Removes variable Clack spinner frames. The final success or error line stays
 * as the repeatable operation result.
 */
function stripNondeterministicSpinnerFrames(value: string): string {
  return value.replace(nondeterministicSpinnerFramePattern, "");
}

/**
 * Clack compares ANSI-styled frames to select how much of a multiselect to draw
 * again. A color terminal emits unchanged option blocks when focus moves. A
 * noncolor terminal emits only lines with changed visible text. Replace the
 * color-only blocks with the same visible updates. Thus, snapshots do not
 * depend on the parent terminal style.
 */
function normalizeColorDrivenMultiselectRedraws(value: string): string {
  const navigationHint =
    `│  ↑/↓ to navigate • Space: select • Enter: confirm${lineFeed}` +
    `└${lineFeed}`;
  const allOption = String.raw`│  ◻ ALL`;
  const selectedOptionPrefix = String.raw`│  ◼`;
  const anyOptionLine = String.raw`│  [◻◼] [^│\n]+\n`;
  const unselectedOptionExceptAllLine =
    String.raw`│  ◻ (?!ALL)[^│\n]+\n`;
  const selectedOptionLineWithoutNewline = String.raw`│  ◼ [^│\n]+`;
  const completeOptionBlock =
    `(?:${anyOptionLine})+${escapeForRegExp(navigationHint)}`;
  const unselectedOptionBlock =
    `(?:${unselectedOptionExceptAllLine})+${escapeForRegExp(navigationHint)}`;
  const firstFocusMove = new RegExp(
    `^${allOption}\\n${completeOptionBlock}`,
    "gm",
  );
  const laterFocusMoves = new RegExp(
    `(?<=${allOption})(?:${unselectedOptionBlock})+(?=${selectedOptionPrefix})`,
    "g",
  );
  const selectedFocusMoves = new RegExp(
    `(${selectedOptionLineWithoutNewline})(?:${completeOptionBlock})+(?=${selectedOptionPrefix})`,
    "g",
  );

  return value
    .replace(firstFocusMove, allOption)
    .replace(laterFocusMoves, "")
    .replace(selectedFocusMoves, "$1");
}

/**
 * Joins lines that Clack wraps to the active terminal width. A space at the end
 * of a line can identify a continuation. One more indent column after the prompt
 * guide can also identify a continuation.
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
      line,
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
 * Determines if two adjacent prompt lines are one line wrapped at the terminal width.
 */
function isSoftWrappedPromptContinuation(
  line: string,
  previousLine: string,
  guidePrefix: string,
): boolean {
  const belongsToSamePrompt = previousLine.startsWith(guidePrefix);
  if (!belongsToSamePrompt) {
    return false;
  }

  const previousLineEndsAtBreakSpace = previousLine.endsWith(" ");
  const textAfterGuide = line.slice(guidePrefix.length);
  const firstCharacterAfterExtraIndent = textAfterGuide.at(1);
  const continuationUsesExtraIndent =
    textAfterGuide.startsWith(" ") &&
    firstCharacterAfterExtraIndent !== undefined &&
    /\S/.test(firstCharacterAfterExtraIndent);

  return previousLineEndsAtBreakSpace || continuationUsesExtraIndent;
}

/** Escapes regular-expression syntax to permit a literal value match. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces all occurrences of a string without case differences. An explicit
 * scan does not require regular-expression escaping. It keeps the original text
 * outside each match.
 */
function replaceAllCaseInsensitive(
  value: string,
  search: string,
  replacement: string,
): string {
  if (search === "") {
    return value;
  }

  let result = "";
  let remaining = value;
  const lowerCaseSearch = search.toLowerCase();
  while (true) {
    const index = remaining.toLowerCase().indexOf(lowerCaseSearch);
    if (index === -1) {
      return result + remaining;
    }
    result += remaining.slice(0, index) + replacement;
    remaining = remaining.slice(index + search.length);
  }
}
