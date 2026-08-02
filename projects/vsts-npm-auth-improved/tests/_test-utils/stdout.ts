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
const semanticVersionPattern =
  String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)` +
  String.raw`(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)` +
  String.raw`(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?` +
  String.raw`(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
const packageVersionAfterName = new RegExp(
  `(vsts-npm-auth-improved )${semanticVersionPattern}(?![0-9A-Za-z.+-])`,
  "g",
);
const standalonePackageVersion = new RegExp(`^${semanticVersionPattern}$`, "gm");

export type OutputWriteFunctionMock = MockInstance<StreamWriteFunction> & {
  readonly normalizedOutput: string;
};

/**
 * Replaces `process.stdout.write` with a Vitest spy that suppresses terminal
 * output and exposes the captured text through a lazily evaluated,
 * snapshot-friendly `normalizedOutput` property.
 */
export function mockStdoutWrite(): OutputWriteFunctionMock {
  return mockStreamWrite(process.stdout, "\n");
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

  const normalizedOutput = outputs
    .map(outputEntry =>
      stripTerminalControlSequences(
        outputEntry.replace(/\r\n?|\u2028|\u2029/g, "\n"),
      ),
    )
    .flatMap(outputEntry => outputEntry.split("\n"))
    .filter(outputEntry => outputEntry.trim() !== "")
    .join("\n");
  return normalizePackageVersion(prefix + normalizedOutput);
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
 * characters while leaving visible terminal text and line feeds intact.
 */
function stripTerminalControlSequences(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][0-2A-Z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "");
}

/**
 * Replaces semantic versions shown after the package name or on their own line
 * so snapshots do not change when the package version changes.
 */
function normalizePackageVersion(output: string): string {
  return output
    .replace(packageVersionAfterName, `$1${packageVersionPlaceholder}`)
    .replace(standalonePackageVersion, packageVersionPlaceholder);
}
