"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SUPPORTED_PRERELEASE_CHANNELS = new Set(["alpha", "beta", "rc"]);
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

class ReleaseToolError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ReleaseToolError";
    this.code = code;
  }
}

function parseVersion(value, label = "version") {
  if (typeof value !== "string") {
    throw new ReleaseToolError(`${label} must be a SemVer string`, "INVALID_SEMVER");
  }

  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    throw new ReleaseToolError(`${label} is not valid SemVer: ${value}`, "INVALID_SEMVER");
  }

  const prerelease = match[4] ? match[4].split(".") : [];
  if (prerelease.length > 0) {
    const [channel, number, ...rest] = prerelease;
    if (!SUPPORTED_PRERELEASE_CHANNELS.has(channel)) {
      throw new ReleaseToolError(
        `${label} uses unsupported prerelease identifier: ${channel}`,
        "UNSUPPORTED_PRERELEASE",
      );
    }
    if (rest.length > 0 || number === undefined || !/^(0|[1-9]\d*)$/.test(number)) {
      throw new ReleaseToolError(
        `${label} prerelease must have the form alpha.N, beta.N, or rc.N`,
        "INVALID_PRERELEASE",
      );
    }
  }

  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    build: match[5]?.split(".") ?? [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.localeCompare(right);
}

function compareVersions(leftValue, rightValue) {
  const left = typeof leftValue === "string" ? parseVersion(leftValue) : leftValue;
  const right = typeof rightValue === "string" ? parseVersion(rightValue) : rightValue;

  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const comparison = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (comparison !== 0) return comparison > 0 ? 1 : -1;
  }
  return 0;
}

function resolveVersion(currentValue, requestedValue) {
  const current = parseVersion(currentValue, "current version");
  let nextVersion;

  if (requestedValue === "auto") {
    if (current.prerelease.length === 0) {
      nextVersion = `${current.major}.${current.minor}.${current.patch + 1}`;
    } else {
      nextVersion = `${current.major}.${current.minor}.${current.patch}-${current.prerelease[0]}.${Number(current.prerelease[1]) + 1}`;
    }
  } else {
    parseVersion(requestedValue, "requested version");
    nextVersion = requestedValue;
  }

  if (compareVersions(nextVersion, current) <= 0) {
    throw new ReleaseToolError(
      `requested version must be greater than current version (${currentValue}): ${nextVersion}`,
      "VERSION_NOT_INCREASING",
    );
  }

  return {
    currentVersion: currentValue,
    requestedVersion: requestedValue,
    version: nextVersion,
    prereleaseChannel: parseVersion(nextVersion).prerelease[0] ?? null,
  };
}

function readPackageMetadata(packageDirectory) {
  const resolvedDirectory = path.resolve(packageDirectory);
  const packageJsonPath = path.join(resolvedDirectory, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new ReleaseToolError(`cannot read package metadata at ${packageJsonPath}: ${error.message}`, "INVALID_PACKAGE_METADATA");
  }
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    throw new ReleaseToolError("package metadata must contain a non-empty name", "INVALID_PACKAGE_METADATA");
  }
  parseVersion(manifest.version, "package version");
  return { name: manifest.name, version: manifest.version, packageDirectory: resolvedDirectory, packageJsonPath };
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function checkNpmVersionConflict(name, version, runner = defaultRunner) {
  const spec = `${name}@${version}`;
  const result = runner("npm", ["view", spec, "version", "--json"], {});
  if (result.status === 0) {
    return { published: true, spec };
  }
  if (/\bE404\b|\b404\b|is not in this registry/i.test(`${result.stdout}\n${result.stderr}`)) {
    return { published: false, spec };
  }
  throw new ReleaseToolError(`npm registry check failed for ${spec}: ${result.stderr.trim() || `exit ${result.status}`}`, "NPM_CHECK_FAILED");
}

function checkGitTagConflict(name, version, repositoryDirectory, runner = defaultRunner) {
  const tag = `${name}@${version}`;
  const result = runner("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: repositoryDirectory });
  if (result.status === 0) return { exists: true, tag };
  if (result.status === 1) return { exists: false, tag };
  throw new ReleaseToolError(`Git tag check failed for ${tag}: ${result.stderr.trim() || `exit ${result.status}`}`, "GIT_CHECK_FAILED");
}

function checkReleaseConflicts(metadata, version, repositoryDirectory, runner = defaultRunner) {
  parseVersion(version, "target version");
  const npm = checkNpmVersionConflict(metadata.name, version, runner);
  const git = checkGitTagConflict(metadata.name, version, repositoryDirectory, runner);
  if (npm.published) throw new ReleaseToolError(`npm version is already published: ${npm.spec}`, "NPM_VERSION_EXISTS");
  if (git.exists) throw new ReleaseToolError(`Git tag already exists: ${git.tag}`, "GIT_TAG_EXISTS");
  return { npmVersionAvailable: true, gitTagAvailable: true, package: metadata.name, version, tag: git.tag };
}

function normalizeRepositoryPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function allowedReleasePath(packageRelativePath, changedPath) {
  const prefix = `${normalizeRepositoryPath(packageRelativePath).replace(/\/$/, "")}/`;
  const relative = normalizeRepositoryPath(changedPath);
  return (
    relative === `${prefix}package.json` ||
    relative === `${prefix}package-lock.json` ||
    (relative.startsWith(`${prefix}tests/__snapshots__/`) && relative.endsWith(".snap"))
  );
}

function validateChangedPaths(packageRelativePath, changedPaths) {
  const normalized = [...new Set(changedPaths.filter(Boolean).map(normalizeRepositoryPath))].sort();
  const unexpectedPaths = normalized.filter((changedPath) => !allowedReleasePath(packageRelativePath, changedPath));
  if (unexpectedPaths.length > 0) {
    throw new ReleaseToolError(`preparation changed unexpected paths: ${unexpectedPaths.join(", ")}`, "UNEXPECTED_CHANGED_PATHS");
  }
  return { valid: true, changedPaths: normalized, packagePath: normalizeRepositoryPath(packageRelativePath) };
}

module.exports = {
  ReleaseToolError,
  checkGitTagConflict,
  checkNpmVersionConflict,
  checkReleaseConflicts,
  compareVersions,
  defaultRunner,
  parseVersion,
  readPackageMetadata,
  resolveVersion,
  validateChangedPaths,
};
