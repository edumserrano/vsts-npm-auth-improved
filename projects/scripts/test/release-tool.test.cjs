"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  checkReleaseConflicts,
  parseVersion,
  resolveVersion,
  validateChangedPaths,
} = require("../release-tool.cjs");

test("auto patch-increments a stable version", () => {
  assert.equal(resolveVersion("1.2.3", "auto").version, "1.2.4");
});

for (const channel of ["alpha", "beta", "rc"]) {
  test(`auto increments an existing ${channel} prerelease without promotion`, () => {
    assert.deepEqual(resolveVersion(`1.0.0-${channel}.1`, "auto"), {
      currentVersion: `1.0.0-${channel}.1`,
      requestedVersion: "auto",
      version: `1.0.0-${channel}.2`,
      prereleaseChannel: channel,
    });
  });
}

test("rejects malformed explicit versions", () => {
  for (const version of ["1.2", "v1.2.3", "1.2.03", "not-a-version"]) {
    assert.throws(() => resolveVersion("1.0.0", version), { code: "INVALID_SEMVER" });
  }
});

test("rejects explicit versions that do not increase", () => {
  assert.throws(() => resolveVersion("1.2.3", "1.2.3"), { code: "VERSION_NOT_INCREASING" });
  assert.throws(() => resolveVersion("1.2.3", "1.2.2"), { code: "VERSION_NOT_INCREASING" });
});

test("rejects unsupported prerelease identifiers", () => {
  assert.throws(() => resolveVersion("1.0.0", "1.1.0-preview.1"), {
    code: "UNSUPPORTED_PRERELEASE",
  });
  assert.throws(() => resolveVersion("1.0.0-dev.1", "auto"), { code: "UNSUPPORTED_PRERELEASE" });
  assert.throws(() => parseVersion("1.0.0-alpha"), { code: "INVALID_PRERELEASE" });
});

function runnerWith({ npmStatus = 1, npmError = "E404", gitStatus = 1 } = {}) {
  return command =>
    command === "npm"
      ? { status: npmStatus, stdout: "", stderr: npmError }
      : { status: gitStatus, stdout: "", stderr: "" };
}

const metadata = { name: "example-package", version: "1.0.0" };

test("rejects an already-published npm version without mutating the registry", () => {
  const commands = [];
  const runner = (command, args) => {
    commands.push([command, ...args]);
    return command === "npm"
      ? { status: 0, stdout: '"1.0.1"', stderr: "" }
      : { status: 1, stdout: "", stderr: "" };
  };
  assert.throws(() => checkReleaseConflicts(metadata, "1.0.1", ".", runner), {
    code: "NPM_VERSION_EXISTS",
  });
  assert.deepEqual(commands, [
    ["npm", "view", "example-package@1.0.1", "version", "--json"],
    ["git", "show-ref", "--verify", "--quiet", "refs/tags/example-package@1.0.1"],
  ]);
});

test("rejects an existing Git tag without creating or changing tags", () => {
  assert.throws(() => checkReleaseConflicts(metadata, "1.0.1", ".", runnerWith({ gitStatus: 0 })), {
    code: "GIT_TAG_EXISTS",
  });
});

test("reports an available npm version and Git tag using read-only checks", () => {
  assert.deepEqual(checkReleaseConflicts(metadata, "1.0.1", ".", runnerWith()), {
    npmVersionAvailable: true,
    gitTagAvailable: true,
    package: "example-package",
    version: "1.0.1",
    tag: "example-package@1.0.1",
  });
});

test("accepts only package manifests, lockfiles, and package snapshots", () => {
  const result = validateChangedPaths("projects/example-package", [
    "projects/example-package/package.json",
    "projects\\example-package\\package-lock.json",
    "projects/example-package/tests/__snapshots__/cli.test.ts.snap",
  ]);
  assert.equal(result.valid, true);
});

test("rejects unexpected changed paths, including deleted or renamed source paths", () => {
  assert.throws(
    () =>
      validateChangedPaths("projects/example-package", [
        "projects/example-package/src/main.ts",
        "projects/other-package/package.json",
        "README.md",
      ]),
    { code: "UNEXPECTED_CHANGED_PATHS" },
  );
});

test("CLI emits JSON and GitHub Actions outputs", context => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "release-tool-test-"));
  context.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const outputPath = path.join(temporaryDirectory, "github-output.txt");
  const packageDirectory = path.join(temporaryDirectory, "package");
  fs.mkdirSync(packageDirectory);
  fs.writeFileSync(
    path.join(packageDirectory, "package.json"),
    `${JSON.stringify({ name: "vsts-npm-auth-improved", version: "1.0.0-alpha.1" }, null, 2)}\n`,
  );
  const cliPath = path.resolve(__dirname, "../release-tool-cli.cjs");
  const result = spawnSync(
    process.execPath,
    [cliPath, "resolve-version", "--package-dir", packageDirectory, "--requested", "auto"],
    { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outputPath }, windowsHide: true },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, "1.0.0-alpha.2");
  const actionOutput = fs.readFileSync(outputPath, "utf8");
  assert.match(actionOutput, /^package=vsts-npm-auth-improved$/m);
  assert.match(actionOutput, /^current_version=1.0.0-alpha.1$/m);
  assert.match(actionOutput, /^version=1.0.0-alpha.2$/m);
  assert.match(actionOutput, /^prerelease_channel=alpha$/m);
});
