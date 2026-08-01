import { Buffer } from "node:buffer";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

/**
 * Captures stdout and optional stderr for complete terminal snapshots. It
 * normalizes only terminal control sequences, timing-dependent spinner frames,
 * test-owned absolute paths, path separators, and newline representation.
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

export function mockStdoutWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stdout, options);
}

export function mockStderrWrite(
  options: OutputNormalizationOptions = {},
): OutputChannelCapture {
  return captureOutputChannel(process.stderr, options);
}

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

function normalizeOutput(
  write: MockInstance<StreamWrite>,
  options: OutputNormalizationOptions,
): string {
  const output = write.mock.calls
    .map(([chunk]) => toText(chunk))
    .join("");

  let normalized = stripNondeterministicSpinnerFrames(
    stripTerminalControlSequences(output).replace(
      /\r\n?|\u2028|\u2029/g,
      "\n",
    ),
  );

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

  return normalized;
}

function normalizeProgressivelyTypedTemporaryRoots(
  output: string,
  temporaryRoots: readonly string[],
): string {
  const normalizedOutput = output.replace(
    /│  ([^\n│]+?)█/g,
    (match, typedValue: string) =>
      temporaryRoots.some(root =>
        root.toLowerCase().startsWith(typedValue.toLowerCase()),
      )
      ? "│  <test-root>█"
      : match,
  );

  return normalizedOutput.replace(
    /(?:│  <test-root>█)+/g,
    "│  <test-root>█",
  );
}

function toText(chunk: string | Uint8Array): string {
  return typeof chunk === "string"
    ? chunk
    : Buffer.from(chunk).toString();
}

function stripTerminalControlSequences(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][0-2A-Z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "");
}

function stripNondeterministicSpinnerFrames(value: string): string {
  // Clack's CI renderer writes an in-progress frame only when an operation
  // crosses its timer interval. The final success/error line is deterministic;
  // the transient animation frame is terminal transport timing, not CLI output.
  return value.replace(
    /^(?:◒|◐|◓|◑|•|o|O|0) {2}(?:Searching for package\.json files|Writing configuration files)\.\.\.\n?/gm,
    "",
  );
}

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
