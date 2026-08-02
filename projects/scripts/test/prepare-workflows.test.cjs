"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "../../..");
const workflows = [
  {
    packageName: "vsts-npm-auth-improved",
    checkName: "Build and test vsts-npm-auth-improved",
    file: ".github/workflows/build-test-prepare-vsts-npm-auth-improved.yml",
  },
  {
    packageName: "create-vsts-npm-auth-improved",
    checkName: "Build and test create-vsts-npm-auth-improved",
    file: ".github/workflows/build-test-prepare-create-vsts-npm-auth-improved.yml",
  },
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function jobSection(workflow, jobName) {
  const match = workflow.match(
    new RegExp(`^  ${jobName}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]+:|(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `missing ${jobName} job`);
  return match[0];
}

function runGuard({ eventName, prepareRelease, ref, packageName = "vsts-npm-auth-improved" }) {
  const windowsGitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const bash =
    process.platform === "win32" && fs.existsSync(windowsGitBash) ? windowsGitBash : "bash";
  return spawnSync(bash, [path.join(root, "projects/scripts/prepare-release.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_SLUG: "test-release-app",
      GH_TOKEN: "test-token-not-a-secret",
      GITHUB_EVENT_NAME: eventName,
      GITHUB_REF: ref,
      GITHUB_REPOSITORY: "example/repository",
      GITHUB_RUN_ID: "123",
      GITHUB_SERVER_URL: "https://github.example",
      PACKAGE_NAME: packageName,
      PREPARE_RELEASE: String(prepareRelease),
      REQUESTED_VERSION: "auto",
      RUNNER_TEMP: process.env.TEMP ?? process.env.TMP ?? root,
    },
  });
}

test("preparation inputs are explicit and default fail-closed", () => {
  for (const workflow of workflows) {
    const source = read(workflow.file);
    assert.match(
      source,
      /prepare_release:\n        description: Prepare a new package version\n        required: true\n        type: boolean\n        default: false/,
    );
    assert.match(
      source,
      /version:\n        description: SemVer version, or "auto"; ignored unless preparation is enabled\n        required: true\n        type: string\n        default: auto/,
    );
  }
});

test("PR and preparation-disabled events cannot enter the credentialed job", () => {
  const mayPrepare = (eventName, prepareRelease) =>
    eventName === "workflow_dispatch" && prepareRelease === true;
  assert.equal(mayPrepare("pull_request", true), false);
  assert.equal(mayPrepare("workflow_dispatch", false), false);
  assert.equal(mayPrepare("workflow_dispatch", true), true);

  for (const workflow of workflows) {
    const source = read(workflow.file);
    const buildJob = jobSection(source, "build-and-test");
    const prepareJob = jobSection(source, "prepare-release");
    assert.match(
      prepareJob,
      /if: github\.event_name == 'workflow_dispatch' && inputs\.prepare_release == true/,
    );
    assert.match(prepareJob, /needs: build-and-test/);
    assert.doesNotMatch(
      buildJob,
      /RELEASE_APP|create-github-app-token|GH_TOKEN|release-preparation|contents: write/,
    );
    assert.equal((source.match(/secrets\.RELEASE_APP_PRIVATE_KEY/g) ?? []).length, 1);
    assert.equal((source.match(/vars\.RELEASE_APP_CLIENT_ID/g) ?? []).length, 1);
  }
});

test("the lifecycle script independently rejects untrusted and disabled invocations before Git or GitHub operations", () => {
  const pullRequest = runGuard({
    eventName: "pull_request",
    prepareRelease: true,
    ref: "refs/pull/1/merge",
  });
  assert.equal(pullRequest.status, 1);
  assert.match(pullRequest.stderr, /allowed only for workflow_dispatch/);

  const disabled = runGuard({
    eventName: "workflow_dispatch",
    prepareRelease: false,
    ref: "refs/heads/main",
  });
  assert.equal(disabled.status, 1);
  assert.match(disabled.stderr, /was not explicitly enabled/);

  const wrongRef = runGuard({
    eventName: "workflow_dispatch",
    prepareRelease: true,
    ref: "refs/heads/topic",
  });
  assert.equal(wrongRef.status, 1);
  assert.match(wrongRef.stderr, /must be dispatched from refs\/heads\/main/);

  const wrongPackage = runGuard({
    eventName: "workflow_dispatch",
    prepareRelease: true,
    ref: "refs/heads/main",
    packageName: "unexpected-package",
  });
  assert.equal(wrongPackage.status, 1);
  assert.match(wrongPackage.stderr, /unsupported package/);
});

test("stable checks stay read-only and retain their required identities", () => {
  for (const workflow of workflows) {
    const source = read(workflow.file);
    const buildJob = jobSection(source, "build-and-test");
    assert.match(source, /^permissions:\n  contents: read$/m);
    assert.match(buildJob, new RegExp(`name: ${workflow.checkName.replaceAll("-", "\\-")}`));
    assert.match(buildJob, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(buildJob, /run: npm ci/);
    assert.match(buildJob, /run: npm run build/);
    assert.match(buildJob, /run: npm test/);
  }
});

test("App credentials and environment are scoped to fail-closed preparation jobs", () => {
  for (const workflow of workflows) {
    const source = read(workflow.file);
    const prepareJob = jobSection(source, "prepare-release");
    assert.match(prepareJob, /environment: release-preparation/);
    assert.match(prepareJob, new RegExp(`group: release-preparation-${workflow.packageName}`));
    assert.match(prepareJob, /cancel-in-progress: false/);
    assert.match(prepareJob, /uses: actions\/create-github-app-token@v3/);
    assert.match(prepareJob, /permission-contents: write/);
    assert.match(prepareJob, /permission-issues: write/);
    assert.match(prepareJob, /permission-pull-requests: write/);
    assert.doesNotMatch(prepareJob, /^          (owner|repositories):/m);
    assert.match(prepareJob, /fetch-depth: 0/);
    assert.match(prepareJob, /fetch-tags: true/);
    assert.match(prepareJob, /persist-credentials: false/);
    assert.match(prepareJob, new RegExp(`PACKAGE_NAME: ${workflow.packageName}`));
  }
});

test("preparation lifecycle is bounded, package-scoped, and contains no publishing", () => {
  const script = read("projects/scripts/prepare-release.sh");
  assert.match(script, /readonly WAIT_TIMEOUT_SECONDS=2100/);
  assert.match(script, /release-prep\/\$PACKAGE_NAME\//);
  assert.match(script, /check-conflicts/);
  assert.match(script, /validate-diff/g);
  assert.match(script, /npm version "\$NEW_VERSION" --no-git-tag-version/);
  assert.match(script, /npm run test:update-snapshots/);
  assert.match(script, /pulls\/\$PR_NUMBER\/update-branch/);
  assert.match(script, /--auto --squash/);
  assert.match(script, /timed out.*open marked PR blocks another preparation/);
  assert.doesNotMatch(script, /npm publish|git tag|git push[^\n]*--tags/);

  for (const workflow of workflows) {
    assert.doesNotMatch(read(workflow.file), /npm publish|workflow_run|push:/);
  }
});
