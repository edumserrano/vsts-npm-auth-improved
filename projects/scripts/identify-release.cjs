#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  ReleaseToolError,
  compareVersions,
  parseVersion,
  validateChangedPaths,
} = require("./release-tool.cjs");

const PACKAGES = ["vsts-npm-auth-improved", "create-vsts-npm-auth-improved"];

class IdentifyReleaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "IdentifyReleaseError";
    this.code = code;
  }
}

function fail(message, code = "UNTRUSTED_RELEASE") {
  throw new IdentifyReleaseError(message, code);
}

function releaseSignal(pr) {
  const labels = (pr.labels ?? []).map(label => label?.name).filter(Boolean);
  return (
    pr.title?.startsWith("[release-prep] ") ||
    pr.head?.ref?.startsWith("release-prep/") ||
    labels.includes("release-preparation") ||
    labels.some(label => label.startsWith("release-package:"))
  );
}

function validatePackageState(packageName, state, revision) {
  const manifest = state.manifest;
  const lockfile = state.lockfile;
  if (manifest?.name !== packageName) {
    fail(`${revision} package name does not match ${packageName}`, "INVALID_PACKAGE_METADATA");
  }
  parseVersion(manifest.version, `${revision} ${packageName} version`);
  if (
    lockfile?.name !== packageName ||
    lockfile?.version !== manifest.version ||
    lockfile?.packages?.[""]?.name !== packageName ||
    lockfile?.packages?.[""]?.version !== manifest.version
  ) {
    fail(
      `${revision} package.json and package-lock.json do not agree for ${packageName}`,
      "INVALID_PACKAGE_METADATA",
    );
  }
  return manifest.version;
}

function deriveTransition(packageStates, changedPaths) {
  const transitions = [];
  for (const packageName of PACKAGES) {
    const states = packageStates[packageName];
    if (!states) fail(`missing Git metadata for ${packageName}`, "INVALID_PACKAGE_METADATA");
    const oldVersion = validatePackageState(packageName, states.parent, "parent");
    const newVersion = validatePackageState(packageName, states.commit, "release commit");
    if (oldVersion !== newVersion) transitions.push({ packageName, oldVersion, newVersion });
  }
  if (transitions.length !== 1) {
    fail(
      `expected exactly one package version transition, found ${transitions.length}`,
      "INVALID_VERSION_TRANSITION",
    );
  }

  const transition = transitions[0];
  if (compareVersions(transition.newVersion, transition.oldVersion) <= 0) {
    fail(
      `${transition.packageName} version must increase (${transition.oldVersion} -> ${transition.newVersion})`,
      "INVALID_VERSION_TRANSITION",
    );
  }
  try {
    validateChangedPaths(`projects/${transition.packageName}`, changedPaths);
  } catch (error) {
    if (error instanceof ReleaseToolError) fail(error.message, error.code);
    throw error;
  }
  for (const required of ["package.json", "package-lock.json"]) {
    const expected = `projects/${transition.packageName}/${required}`;
    if (!changedPaths.includes(expected)) {
      fail(`release commit does not change required file ${expected}`, "INVALID_CHANGED_PATHS");
    }
  }
  return transition;
}

function parseAuditBody(body) {
  const pattern =
    /^Automated release preparation\.\r?\n\r?\n- Package: `([^`]+)`\r?\n- Old version: `([^`]+)`\r?\n- New version: `([^`]+)`\r?\n- Source commit: `([0-9a-f]{40})`\r?\n- Workflow run: (https:\/\/[^\s]+\/actions\/runs\/([1-9]\d*))\r?\n- Preparation branch: `([^`]+)`\r?\n?$/;
  const match = pattern.exec(body ?? "");
  if (!match)
    fail(
      "preparation PR body does not contain the exact audit metadata format",
      "INVALID_AUDIT_METADATA",
    );
  return {
    packageName: match[1],
    oldVersion: match[2],
    newVersion: match[3],
    sourceCommit: match[4],
    workflowUrl: match[5],
    runId: match[6],
    branch: match[7],
  };
}

function identifyRelease(input) {
  if (input.ref !== "refs/heads/main") fail(`unexpected ref: ${input.ref}`, "INVALID_EVENT");
  if (!/^[0-9a-f]{40}$/.test(input.sha ?? ""))
    fail("event SHA is not a full commit ID", "INVALID_EVENT");
  if (!Array.isArray(input.pullRequests))
    fail("associated pull request response is not an array", "INVALID_API_RESPONSE");

  if (input.pullRequests.length === 0)
    return { trustedRelease: false, selectedPackage: "", releaseCommit: "" };

  const signalled = input.pullRequests.filter(releaseSignal);
  if (signalled.length === 0)
    return { trustedRelease: false, selectedPackage: "", releaseCommit: "" };
  const transition = deriveTransition(input.packageStates, input.changedPaths);
  if (input.pullRequests.length !== 1 || signalled.length !== 1) {
    fail(
      "release commit must have exactly one associated preparation PR",
      "AMBIGUOUS_ASSOCIATED_PRS",
    );
  }
  if (!input.appSlug) fail("release App slug is required", "MISSING_APP_SLUG");
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(input.appSlug))
    fail("RELEASE_APP_SLUG is invalid", "INVALID_APP_SLUG");

  const pr = signalled[0];
  const packageName = transition.packageName;
  const expectedBranchPrefix = `release-prep/${packageName}/`;
  const expectedTitle = `[release-prep] ${packageName}@${transition.newVersion}`;
  const labels = (pr.labels ?? []).map(label => label?.name).filter(Boolean);
  const expectedBot = `${input.appSlug}[bot]`;

  const checks = [
    [pr.base?.ref === "main", "PR base is not main"],
    [typeof pr.merged_at === "string" && pr.merged_at.length > 0, "PR is not merged"],
    [pr.merge_commit_sha === input.sha, "PR merge commit does not equal the pushed SHA"],
    [pr.user?.login === expectedBot, `PR author is not ${expectedBot}`],
    [pr.head?.repo?.full_name === input.repository, "PR head repository is not this repository"],
    [pr.head?.ref?.startsWith(expectedBranchPrefix), "PR head branch has the wrong package prefix"],
    [pr.title === expectedTitle, "PR title does not agree with the Git-derived release"],
    [labels.includes("release-preparation"), "PR lacks the release-preparation label"],
    [labels.includes(`release-package:${packageName}`), "PR lacks the selected package label"],
    [
      !PACKAGES.some(
        candidate => candidate !== packageName && labels.includes(`release-package:${candidate}`),
      ),
      "PR has a conflicting package label",
    ],
  ];
  for (const [valid, message] of checks) if (!valid) fail(message);

  const audit = parseAuditBody(pr.body);
  const expectedWorkflowPrefix = `https://github.com/${input.repository}/actions/runs/`;
  const expectedBranch = `${expectedBranchPrefix}${transition.newVersion}/${audit.runId}`;
  const auditChecks = [
    [audit.packageName === packageName, "audit package does not agree with Git"],
    [audit.oldVersion === transition.oldVersion, "audit old version does not agree with Git"],
    [audit.newVersion === transition.newVersion, "audit new version does not agree with Git"],
    [
      audit.workflowUrl === `${expectedWorkflowPrefix}${audit.runId}`,
      "audit workflow run marker is invalid",
    ],
    [
      audit.branch === pr.head.ref && audit.branch === expectedBranch,
      "audit branch does not agree with the PR",
    ],
    [
      input.sourceCommitIsAncestor(audit.sourceCommit, input.parentSha),
      "audit source commit is not in the release parent lineage",
    ],
  ];
  for (const [valid, message] of auditChecks) if (!valid) fail(message, "INVALID_AUDIT_METADATA");

  return {
    trustedRelease: true,
    selectedPackage: packageName,
    releaseCommit: input.sha,
    parentCommit: input.parentSha,
    oldVersion: transition.oldVersion,
    newVersion: transition.newVersion,
    pullRequestNumber: pr.number,
  };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0)
    fail(`git ${args[0]} failed: ${result.stderr.trim()}`, "GIT_CHECK_FAILED");
  return result.stdout;
}

function gitJson(root, revision, relativePath) {
  try {
    return JSON.parse(git(root, ["show", `${revision}:${relativePath}`]));
  } catch (error) {
    if (error instanceof IdentifyReleaseError) throw error;
    fail(
      `invalid JSON at ${revision}:${relativePath}: ${error.message}`,
      "INVALID_PACKAGE_METADATA",
    );
  }
}

function machineOutputs(result, expectedPackage) {
  const selected = result.trustedRelease && result.selectedPackage === expectedPackage;
  return {
    trusted_release: String(selected),
    selected_package: result.selectedPackage,
    release_commit: result.releaseCommit,
    old_version: result.oldVersion ?? "",
    new_version: result.newVersion ?? "",
    pull_request_number: result.pullRequestNumber ?? "",
  };
}

function writeOutputs(result, expectedPackage) {
  const outputs = machineOutputs(result, expectedPackage);
  for (const [name, value] of Object.entries(outputs))
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  process.stdout.write(`${JSON.stringify(outputs)}\n`);
}

function cli() {
  const required = ["EXPECTED_PACKAGE", "GITHUB_REF", "GITHUB_REPOSITORY", "GITHUB_SHA", "PR_JSON"];
  for (const name of required)
    if (!process.env[name])
      fail(`required environment value ${name} is missing`, "INVALID_ARGUMENT");
  if (!PACKAGES.includes(process.env.EXPECTED_PACKAGE))
    fail("EXPECTED_PACKAGE is unsupported", "INVALID_ARGUMENT");

  const root = path.resolve(__dirname, "../..");
  const pullRequests = JSON.parse(fs.readFileSync(process.env.PR_JSON, "utf8"));
  if (
    Array.isArray(pullRequests) &&
    (pullRequests.length === 0 || !pullRequests.some(releaseSignal))
  ) {
    const result = identifyRelease({
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      pullRequests,
    });
    writeOutputs(result, process.env.EXPECTED_PACKAGE);
    return;
  }
  const parentLine = git(root, ["rev-list", "--parents", "-n", "1", process.env.GITHUB_SHA])
    .trim()
    .split(/\s+/);
  if (parentLine.length !== 2)
    fail("release commit must have exactly one parent", "INVALID_VERSION_TRANSITION");
  const parentSha = parentLine[1];
  const changedPaths = git(root, [
    "diff",
    "--name-only",
    "--no-renames",
    `${parentSha}..${process.env.GITHUB_SHA}`,
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(value => value.replaceAll("\\", "/"));
  const packageStates = Object.fromEntries(
    PACKAGES.map(packageName => {
      const prefix = `projects/${packageName}`;
      const state = revision => ({
        manifest: gitJson(root, revision, `${prefix}/package.json`),
        lockfile: gitJson(root, revision, `${prefix}/package-lock.json`),
      });
      return [packageName, { parent: state(parentSha), commit: state(process.env.GITHUB_SHA) }];
    }),
  );
  const result = identifyRelease({
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    parentSha,
    repository: process.env.GITHUB_REPOSITORY,
    appSlug: process.env.RELEASE_APP_SLUG ?? "",
    pullRequests,
    changedPaths,
    packageStates,
    sourceCommitIsAncestor(source, parent) {
      return (
        spawnSync("git", ["merge-base", "--is-ancestor", source, parent], {
          cwd: root,
          windowsHide: true,
        }).status === 0
      );
    },
  });
  writeOutputs(result, process.env.EXPECTED_PACKAGE);
}

module.exports = { IdentifyReleaseError, identifyRelease, machineOutputs, releaseSignal };

if (require.main === module) {
  try {
    cli();
  } catch (error) {
    const code =
      error instanceof IdentifyReleaseError || error instanceof ReleaseToolError
        ? error.code
        : "UNEXPECTED_ERROR";
    process.stderr.write(`${JSON.stringify({ error: code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}
