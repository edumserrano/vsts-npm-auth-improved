import { Buffer } from "node:buffer";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

const packageVersionPlaceholder = "<PACKAGE_VERSION>";
const semanticVersionPattern =
  String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)` +
  String.raw`(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)` +
  String.raw`(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?` +
  String.raw`(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
const packageVersionAfterName = new RegExp(
  `((?:create-)?vsts-npm-auth-improved )${semanticVersionPattern}(?![0-9A-Za-z.+-])`,
  "g",
);
const standalonePackageVersion = new RegExp(`^${semanticVersionPattern}$`, "gm");

/**
 * Captures stdout and optional stderr for complete terminal snapshots. It
 * normalizes only terminal control sequences, timing-dependent spinner frames,
 * test-owned absolute paths, path separators, newline representation, and
 * release-specific package versions.
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
 * Captures stdout and, when requested, stderr with the same normalization
 * options so tests can assert complete process output without writing it to the
 * terminal.
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
 * Replaces `process.stdout.write` with a capture that exposes both the write
 * spy and its lazily normalized output.
 */
export function mockStdoutWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stdout, options);
}

/**
 * Replaces `process.stderr.write` with a capture that exposes both the write
 * spy and its lazily normalized output.
 */
export function mockStderrWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stderr, options);
}

/**
 * Spies on one process stream, suppresses its real writes, and returns a getter
 * that normalizes all captured chunks on demand using the supplied options.
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
 * Concatenates captured chunks and removes platform-, timing-, terminal-, and
 * release-specific differences while preserving the CLI content that tests
 * are intended to verify.
 */
function normalizeOutput(
  write: MockInstance<StreamWrite>,
  options: OutputNormalizationOptions,
): string {
  const output = write.mock.calls
    .map(([chunk]) => toText(chunk))
    .join("");

  let normalized = output.replace(/\r\n?|\u2028|\u2029/g, "\n");
  normalized = stripTerminalControlSequences(normalized);
  normalized = stripNondeterministicSpinnerFrames(normalized);
  normalized = normalizeColorDrivenMultiselectRedraws(normalized);
  normalized = joinSoftWrappedPromptLines(normalized.split("\n")).join("\n");

  const temporaryRoots = [...(options.temporaryRoots ?? [])]
    .map(root => root.replaceAll("\\", "/"))
    .sort((left, right) => right.length - left.length);
  normalized = normalized.replaceAll("\\", "/");
  normalized = normalizeProgressivelyTypedTemporaryRoots(
    normalized,
    temporaryRoots,
  );
  for (const temporaryRoot of temporaryRoots) {
    normalized = replaceAllCaseInsensitive(
      normalized,
      temporaryRoot,
      "<test-root>",
    );
  }

  return normalizePackageVersion(normalized);
}

/**
 * Replaces semantic versions shown after either package name or on their own
 * line so snapshots remain stable across releases.
 */
function normalizePackageVersion(output: string): string {
  return output
    .replace(packageVersionAfterName, `$1${packageVersionPlaceholder}`)
    .replace(standalonePackageVersion, packageVersionPlaceholder);
}

/**
 * Collapses the redraw frames produced while a complete known temporary root
 * is typed into one `<test-root>` frame. Requiring the complete root in the
 * same sequence prevents unrelated absolute input from matching a shared
 * prefix such as `/` on Linux.
 */
function normalizeProgressivelyTypedTemporaryRoots(
  output: string,
  temporaryRoots: readonly string[],
): string {
  return output.replace(
    /(?:│  [^\n│]+?█)+/g,
    typingSequence => {
      const typedValues = [
        ...typingSequence.matchAll(/│  ([^\n│]+?)█/g),
      ].map(([, typedValue]) => typedValue);
      const completedRoots = temporaryRoots.filter(root =>
        typedValues.some(
          typedValue => typedValue.toLowerCase() === root.toLowerCase(),
        ),
      );

      if (completedRoots.length === 0) {
        return typingSequence;
      }

      return typingSequence
        .replace(
          /│  ([^\n│]+?)█/g,
          (match, typedValue: string) =>
            completedRoots.some(root =>
              root.toLowerCase().startsWith(typedValue.toLowerCase()),
            )
              ? "│  <test-root>█"
              : match,
        )
        .replace(/(?:│  <test-root>█)+/g, "│  <test-root>█");
    },
  );
}

/**
 * Converts either form accepted by a Node.js stream write into UTF-8 text for
 * normalization.
 */
function toText(chunk: string | Uint8Array): string {
  return typeof chunk === "string"
    ? chunk
    : Buffer.from(chunk).toString();
}

/**
 * Removes ANSI control-sequence families and remaining non-printing control
 * characters while leaving visible terminal text intact.
 */
function stripTerminalControlSequences(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][0-2A-Z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "");
}

/**
 * Removes Clack's timing-dependent in-progress spinner frames. The final
 * success or error line remains as the deterministic operation result.
 */
function stripNondeterministicSpinnerFrames(value: string): string {
  return value.replace(
    /^(?:◒|◐|◓|◑|•|o|O|0) {2}(?:Searching for package\.json files|Writing configuration files)\.\.\.\n?/gm,
    "",
  );
}

/**
 * Clack compares ANSI-styled frames when deciding how much of a multiselect to
 * redraw. A color-enabled terminal therefore emits unchanged option blocks as
 * focus moves, while a non-color terminal emits only lines whose visible text
 * changed. Collapse the color-only blocks to those same visible updates so
 * snapshots do not depend on the parent terminal's styling.
 */
function normalizeColorDrivenMultiselectRedraws(value: string): string {
  const navigationHint = "│  ↑/↓ to navigate • Space: select • Enter: confirm\n└\n";
  const firstFocusMove = new RegExp(
    `^│  ◻ ALL\\n(?:│  [◻◼] [^│\\n]+\\n)+${escapeForRegExp(navigationHint)}`,
    "gm",
  );
  const laterFocusMoves = new RegExp(
    `(?<=│  ◻ ALL)(?:(?:│  ◻ (?!ALL)[^│\\n]+\\n)+${escapeForRegExp(navigationHint)})+(?=│  ◼)`,
    "g",
  );
  const selectedFocusMoves = new RegExp(
    `(│  ◼ [^│\\n]+)(?:(?:│  [◻◼] [^│\\n]+\\n)+${escapeForRegExp(navigationHint)})+(?=│  ◼)`,
    "g",
  );

  return value
    .replace(firstFocusMove, "│  ◻ ALL")
    .replace(laterFocusMoves, "")
    .replace(selectedFocusMoves, "$1");
}

/**
 * Rejoins lines that Clack soft-wraps to the active terminal width. Depending
 * on the wrapper path, a continuation is marked by either a trailing break
 * space or one extra indentation column after the prompt guide.
 */
function joinSoftWrappedPromptLines(lines: readonly string[]): string[] {
  const joinedLines: string[] = [];
  for (const line of lines) {
    const previousLineIndex = joinedLines.length - 1;
    const previousLine = joinedLines[previousLineIndex];
    const guidePrefix = line.match(/^[│|] {2}/)?.[0];
    if (
      previousLine !== undefined &&
      guidePrefix !== undefined &&
      previousLine.startsWith(guidePrefix) &&
      (previousLine.endsWith(" ") || /^[│|] {3}\S/.test(line))
    ) {
      joinedLines[previousLineIndex] = previousLine + line.slice(guidePrefix.length);
    } else {
      joinedLines.push(line);
    }
  }
  return joinedLines;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every occurrence of a string without regard to casing. An explicit
 * scan avoids regular-expression escaping and preserves the original text
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
