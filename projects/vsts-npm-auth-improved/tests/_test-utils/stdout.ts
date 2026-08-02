import { MockInstance, vi } from "vitest";

/**
 * Captures writes to stdout and exposes normalized terminal output for complete
 * scenario snapshots. Normalization removes terminal control formatting,
 * transport-only blank lines, and release-specific package versions while
 * preserving the CLI's visible content.
 */

type StdoutWriteFunction = typeof process.stdout.write;

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

export type StdoutWriteFunctionMock = MockInstance<StdoutWriteFunction> & {
  readonly normalizedOutput: string;
};

/**
 * Replaces `process.stdout.write` with a Vitest spy that suppresses terminal
 * output and exposes the captured text through a lazily evaluated,
 * snapshot-friendly `normalizedOutput` property.
 */
export function mockStdoutWrite(): StdoutWriteFunctionMock {
  const mock: MockInstance<StdoutWriteFunction> = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const augmentedMock = mock as StdoutWriteFunctionMock;
  Object.defineProperty(augmentedMock, "normalizedOutput", {
    get() {
      return normalizeStdout(this);
    },
    configurable: true,
  });
  return augmentedMock;
}

/**
 * Collects string writes from the stdout spy, removes Clack's ANSI formatting
 * and transport-only blank lines, joins the visible lines, and replaces the
 * package version with a stable placeholder.
 */
function normalizeStdout(stdoutWriteFunctionMock: MockInstance<StdoutWriteFunction>): string {
  const stringOutputs = stdoutWriteFunctionMock.mock.calls
    .map(args => args[0])
    .filter((output): output is string => typeof output === "string");
  if (stringOutputs.length === 0) {
    return "";
  }

  // Remove ANSI escape codes from @clack/prompts output to make snapshots easier to read.
  // We test our CLI's output and behavior, not the library's internal formatting choices.
  const ansiRegex = /\x1B\[[^m]*[a-zA-Z]|\x1B\].*?\x07/g; // Matches ESC[ followed by any characters and a letter, or ESC] sequences
  const normalizedOutput = stringOutputs
    .map(outputEntry => outputEntry.replace(ansiRegex, "")) // remove ANSI escape codes (color codes, cursor movements, etc.) used by @clack/prompts
    .flatMap(outputEntry => outputEntry.split("\n")) // a single output entry could contain multiple lines (e.g., "line1\nline2\nline3"). We need to split them first.
    .filter(outputEntry => outputEntry.trim() !== "")
    .join("\n");
  return normalizePackageVersion("\n" + normalizedOutput);
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
