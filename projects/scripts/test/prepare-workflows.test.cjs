"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "../../..");
const workflows = [
  {
    packageName: "vsts-npm-auth-improved",
    checkName: "Build and test vsts-npm-auth-improved",
    buildFile: ".github/workflows/build-test-vsts-npm-auth-improved.yml",
    prepareFile: ".github/workflows/prepare-release-vsts-npm-auth-improved.yml",
  },
  {
    packageName: "create-vsts-npm-auth-improved",
    checkName: "Build and test create-vsts-npm-auth-improved",
    buildFile: ".github/workflows/build-test-create-vsts-npm-auth-improved.yml",
    prepareFile: ".github/workflows/prepare-release-create-vsts-npm-auth-improved.yml",
  },
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replaceAll("\r\n", "\n");
}

function jobSection(workflow, jobName) {
  const match = workflow.match(
    new RegExp(`^  ${jobName}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]+:|(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `missing ${jobName} job`);
  return match[0];
}

function runGuard({ eventName, ref, packageName = "vsts-npm-auth-improved" }) {
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
      REQUESTED_VERSION: "auto",
      RUNNER_TEMP: process.env.TEMP ?? process.env.TMP ?? root,
    },
  });
}

function bashPath(file) {
  const normalized = file.replaceAll("\\", "/");
  if (process.platform !== "win32") return normalized;
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function runLabelLookup(packageName, failedLookup = "") {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-label-test-"));
  const mockEnvironment = path.join(temporaryDirectory, "mock-environment.sh");
  const lookupLog = path.join(temporaryDirectory, "label-lookups.txt");

  fs.writeFileSync(
    mockEnvironment,
    `git() {
if [[ "$1" == "rev-parse" && "$2" == "--show-toplevel" ]]; then
  printf '%s\\n' "$MOCK_REPOSITORY_ROOT"
elif [[ "$1" == "rev-parse" ]]; then
  printf '%s\\n' '0123456789abcdef0123456789abcdef01234567'
fi
return 0
}
jq() {
while (($#)); do
  if [[ "$1" == "--arg" && "$2" == "value" ]]; then
    value="$3"
    break
  fi
  shift
done
[[ -n "\${value:-}" ]] || return 2
printf '%s\\n' "\${value//:/%3A}"
}
gh() {
if [[ "$1" == "auth" && "$2" == "setup-git" ]]; then
  return 0
fi
if [[ "$1" == "api" && "$2" == "--method" && "$3" == "GET" && "$5" == "--silent" ]]; then
  printf '%s\\n' "$4" >> "$MOCK_LABEL_LOOKUP_LOG"
  if [[ "$4" == "$MOCK_FAILED_LABEL_LOOKUP" ]]; then
    printf '%s\\n' 'simulated label API failure' >&2
    return 1
  fi
  return 0
fi
printf '%s\\n' 'STOP_AFTER_LABEL_LOOKUPS' >&2
return 42
}
`,
  );

  const windowsGitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const bash =
    process.platform === "win32" && fs.existsSync(windowsGitBash) ? windowsGitBash : "bash";
  const result = spawnSync(bash, [path.join(root, "projects/scripts/prepare-release.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_SLUG: "test-release-app",
      BASH_ENV: bashPath(mockEnvironment),
      GH_TOKEN: "test-token-not-a-secret",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "example/repository",
      GITHUB_RUN_ID: "123",
      GITHUB_SERVER_URL: "https://github.example",
      MOCK_LABEL_LOOKUP_LOG: bashPath(lookupLog),
      MOCK_FAILED_LABEL_LOOKUP: failedLookup,
      MOCK_REPOSITORY_ROOT: bashPath(root),
      PACKAGE_NAME: packageName,
      REQUESTED_VERSION: "auto",
      RUNNER_TEMP: temporaryDirectory,
    },
  });
  const lookups = fs.existsSync(lookupLog)
    ? fs.readFileSync(lookupLog, "utf8").trim().split(/\r?\n/)
    : [];
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return { result, lookups };
}

test("build workflows are parameterless and preparation accepts only a version", () => {
  for (const workflow of workflows) {
    const buildSource = read(workflow.buildFile);
    const prepareSource = read(workflow.prepareFile);
    assert.match(buildSource, /^on:\n  pull_request:\n  workflow_dispatch:$/m);
    assert.doesNotMatch(buildSource, /^    inputs:|^      prepare_release:|^      version:/m);
    assert.match(prepareSource, /^on:\n  workflow_dispatch:\n    inputs:$/m);
    assert.match(
      prepareSource,
      /version:\n        description: SemVer version, or "auto"\n        required: true\n        type: string\n        default: auto/,
    );
    assert.doesNotMatch(prepareSource, /prepare_release:|pull_request:/);
  }
});

test("App credentials are absent from build workflows and present only in preparation", () => {
  for (const workflow of workflows) {
    const buildSource = read(workflow.buildFile);
    const prepareSource = read(workflow.prepareFile);
    const buildJob = jobSection(buildSource, "build-and-test");
    const prepareJob = jobSection(prepareSource, "prepare-release");
    assert.doesNotMatch(prepareJob, /^    (if|needs):/m);
    assert.doesNotMatch(
      buildJob,
      /RELEASE_APP|create-github-app-token|GH_TOKEN|release-preparation|contents: write/,
    );
    assert.equal((prepareSource.match(/secrets\.RELEASE_APP_PRIVATE_KEY/g) ?? []).length, 1);
    assert.equal((prepareSource.match(/vars\.RELEASE_APP_CLIENT_ID/g) ?? []).length, 1);
  }
});

test("the lifecycle script independently rejects untrusted invocations before Git or GitHub operations", () => {
  const pullRequest = runGuard({
    eventName: "pull_request",
    ref: "refs/pull/1/merge",
  });
  assert.equal(pullRequest.status, 1);
  assert.match(pullRequest.stderr, /allowed only for workflow_dispatch/);

  const wrongRef = runGuard({
    eventName: "workflow_dispatch",
    ref: "refs/heads/topic",
  });
  assert.equal(wrongRef.status, 1);
  assert.match(wrongRef.stderr, /must be dispatched from refs\/heads\/main/);

  const wrongPackage = runGuard({
    eventName: "workflow_dispatch",
    ref: "refs/heads/main",
    packageName: "unexpected-package",
  });
  assert.equal(wrongPackage.status, 1);
  assert.match(wrongPackage.stderr, /unsupported package/);
});

test("required labels use supported exact URL-encoded GitHub REST lookups", () => {
  const script = read("projects/scripts/prepare-release.sh");
  assert.doesNotMatch(script, /\bgh label view\b/);
  assert.match(script, /jq -rn --arg value "\$label" '\$value \| @uri'/);
  assert.match(
    script,
    /gh api --method GET "repos\/\$GITHUB_REPOSITORY\/labels\/\$encoded_label" --silent/,
  );

  for (const packageName of ["vsts-npm-auth-improved", "create-vsts-npm-auth-improved"]) {
    const { result, lookups } = runLabelLookup(packageName);
    assert.equal(result.status, 42, result.stderr);
    assert.match(result.stderr, /STOP_AFTER_LABEL_LOOKUPS/);
    assert.deepEqual(lookups, [
      "repos/example/repository/labels/release-preparation",
      `repos/example/repository/labels/release-package%3A${packageName}`,
    ]);
  }

  const failed = runLabelLookup(
    "vsts-npm-auth-improved",
    "repos/example/repository/labels/release-preparation",
  );
  assert.equal(failed.result.status, 1);
  assert.match(failed.result.stderr, /simulated label API failure/);
  assert.match(
    failed.result.stderr,
    /required repository label 'release-preparation' is missing or its exact GitHub API lookup failed/,
  );
  assert.deepEqual(failed.lookups, ["repos/example/repository/labels/release-preparation"]);
});

test("stable checks stay read-only and retain their required identities", () => {
  for (const workflow of workflows) {
    const source = read(workflow.buildFile);
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
    const source = read(workflow.prepareFile);
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
  assert.match(script, /npm run build/);
  assert.match(script, /npm test/);
  assert.match(script, /pulls\/\$PR_NUMBER\/update-branch/);
  assert.match(script, /--auto --squash/);
  assert.match(script, /timed out.*open marked PR blocks another preparation/);
  assert.doesNotMatch(script, /npm publish|git tag|git push[^\n]*--tags/);

  for (const workflow of workflows) {
    assert.doesNotMatch(read(workflow.buildFile), /npm publish|workflow_run|push:/);
    assert.doesNotMatch(read(workflow.prepareFile), /npm publish|workflow_run|push:/);
  }
});
