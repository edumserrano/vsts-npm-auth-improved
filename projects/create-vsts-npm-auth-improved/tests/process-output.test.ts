import { afterEach, expect, test, vi } from "vitest";
import { mockStdoutWrite } from "@test-utils/process-output";

afterEach(() => {
  vi.restoreAllMocks();
});

test("normalizes a complete progressively typed temporary root", () => {
  const temporaryRoot = "/tmp/create-vsts-npm-auth-improved/test-root";
  const output = mockStdoutWrite({ temporaryRoots: [temporaryRoot] });

  process.stdout.write(progressiveTypingFrames(temporaryRoot));

  expect(output.normalizedOutput).toBe("│  <test-root>█");
});

test("does not normalize an unrelated absolute input on Linux", () => {
  const temporaryRoot = "/tmp/create-vsts-npm-auth-improved/test-root";
  const registry = "/relative/registry";
  const output = mockStdoutWrite({ temporaryRoots: [temporaryRoot] });

  process.stdout.write(progressiveTypingFrames(registry));

  expect(output.normalizedOutput).toBe(progressiveTypingFrames(registry));
});

function progressiveTypingFrames(value: string): string {
  return [...value]
    .map((_, index) => `│  ${value.slice(0, index + 1)}█`)
    .join("");
}
