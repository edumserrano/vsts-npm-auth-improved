#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  ReleaseToolError,
  checkReleaseConflicts,
  defaultRunner,
  readPackageMetadata,
  resolveVersion,
  validateChangedPaths,
} = require("./release-tool.cjs");

function parseArguments(values) {
  const [command, ...rest] = values;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new ReleaseToolError(`invalid argument: ${key ?? ""}`, "INVALID_ARGUMENT");
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  if (!options[name]) throw new ReleaseToolError(`--${name} is required`, "INVALID_ARGUMENT");
  return options[name];
}

function repositoryRoot(packageDirectory) {
  const result = defaultRunner("git", ["rev-parse", "--show-toplevel"], { cwd: packageDirectory });
  if (result.status !== 0) throw new ReleaseToolError(`cannot find Git repository: ${result.stderr.trim()}`, "GIT_CHECK_FAILED");
  return path.resolve(result.stdout.trim());
}

function gitChangedPaths(root, base, head) {
  const rangeArguments = head ? [base, head] : [base];
  // Disabling rename detection makes both sides of a rename visible. Deletions and
  // other unusual changes must also pass the same allowlist as ordinary edits.
  const result = defaultRunner("git", ["diff", "--name-only", "-z", "--no-renames", ...rangeArguments], { cwd: root });
  if (result.status !== 0) throw new ReleaseToolError(`cannot inspect preparation diff: ${result.stderr.trim()}`, "GIT_CHECK_FAILED");
  const paths = result.stdout.split("\0").filter(Boolean);
  if (head) return paths;

  const untracked = defaultRunner("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root });
  if (untracked.status !== 0) throw new ReleaseToolError(`cannot inspect untracked files: ${untracked.stderr.trim()}`, "GIT_CHECK_FAILED");
  return [...paths, ...untracked.stdout.split("\0").filter(Boolean)];
}

function writeGithubOutput(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(result)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}=${value ?? ""}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

function run(values) {
  const { command, options } = parseArguments(values);
  const packageDirectory = requireOption(options, "package-dir");
  const metadata = readPackageMetadata(packageDirectory);
  let result;

  if (command === "metadata") {
    result = metadata;
  } else if (command === "resolve-version") {
    result = { package: metadata.name, ...resolveVersion(metadata.version, requireOption(options, "requested")) };
  } else if (command === "check-conflicts") {
    const root = repositoryRoot(packageDirectory);
    result = checkReleaseConflicts(metadata, requireOption(options, "version"), root);
  } else if (command === "validate-diff") {
    const root = repositoryRoot(packageDirectory);
    const relativePackagePath = normalizeRelative(root, packageDirectory);
    result = validateChangedPaths(relativePackagePath, gitChangedPaths(root, requireOption(options, "base"), options.head));
  } else {
    throw new ReleaseToolError(
      "usage: release-tool-cli.cjs <metadata|resolve-version|check-conflicts|validate-diff> --package-dir <path> [options]",
      "INVALID_ARGUMENT",
    );
  }
  writeGithubOutput(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function normalizeRelative(root, target) {
  const relative = path.relative(root, path.resolve(target)).replaceAll("\\", "/");
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new ReleaseToolError("package directory must be inside the Git repository", "INVALID_ARGUMENT");
  }
  return relative;
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const code = error instanceof ReleaseToolError ? error.code : "UNEXPECTED_ERROR";
  process.stderr.write(`${JSON.stringify({ error: code, message: error.message })}\n`);
  process.exitCode = 1;
}
