import { expect, test } from "vitest";
import { formatNpmrcGitignoreWarning } from "../src/init-auth/auth-setup/npmrc-gitignore-warning";

test("returns no warning when the Git ignore check fails", () => {
  expect(
    formatNpmrcGitignoreWarning({
      status: "failed",
      cause: new Error("ignore check failed"),
    }),
  ).toBeUndefined();
});

test("returns no warning when no changed npmrc files are ignored", () => {
  expect(
    formatNpmrcGitignoreWarning({
      status: "checked",
      ignoredDisplayPaths: [],
    }),
  ).toBeUndefined();
});

test("formats successfully detected ignored npmrc files", () => {
  expect(
    formatNpmrcGitignoreWarning({
      status: "checked",
      ignoredDisplayPaths: ["packages/alpha/.npmrc", "packages/beta/.npmrc"],
    }),
  ).toContain("- packages/alpha/.npmrc\n- packages/beta/.npmrc");
});
