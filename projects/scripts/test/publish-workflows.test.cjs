"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { identifyRelease, machineOutputs } = require("../identify-release.cjs");

const root = path.resolve(__dirname, "../../..");
const repository = "example/vsts-npm-auth-improved";
const sha = "b".repeat(40);
const parentSha = "a".repeat(40);
const releaseAppSlug = "vsts-npm-auth-release-bot";
const packageNames = ["vsts-npm-auth-improved", "create-vsts-npm-auth-improved"];
const workflows = packageNames.map(packageName => ({
  packageName,
  file: `.github/workflows/publish-${packageName}.yml`,
}));

function packageState(packageName, version) {
  return {
    manifest: { name: packageName, version },
    lockfile: {
      name: packageName,
      version,
      packages: { "": { name: packageName, version } },
    },
  };
}

function inputFor(packageName = packageNames[0]) {
  const versions = Object.fromEntries(
    packageNames.map(name => [
      name,
      name === packageName ? ["1.0.0", "1.0.1"] : ["2.0.0", "2.0.0"],
    ]),
  );
  const runId = "12345";
  const branch = `release-prep/${packageName}/1.0.1/${runId}`;
  const body = [
    "Automated release preparation.",
    "",
    `- Package: \`${packageName}\``,
    "- Old version: `1.0.0`",
    "- New version: `1.0.1`",
    `- Source commit: \`${parentSha}\``,
    `- Workflow run: https://github.com/${repository}/actions/runs/${runId}`,
    `- Preparation branch: \`${branch}\``,
    "",
  ].join("\n");
  return {
    ref: "refs/heads/main",
    sha,
    parentSha,
    repository,
    appSlug: releaseAppSlug,
    pullRequests: [
      {
        number: 17,
        title: `[release-prep] ${packageName}@1.0.1`,
        body,
        merged_at: "2026-08-02T12:00:00Z",
        merge_commit_sha: sha,
        user: { login: `${releaseAppSlug}[bot]` },
        base: { ref: "main" },
        head: { ref: branch, repo: { full_name: repository } },
        labels: [{ name: "release-preparation" }, { name: `release-package:${packageName}` }],
      },
    ],
    changedPaths: [
      `projects/${packageName}/package.json`,
      `projects/${packageName}/package-lock.json`,
      `projects/${packageName}/tests/__snapshots__/version.test.ts.snap`,
    ],
    packageStates: Object.fromEntries(
      packageNames.map(name => [
        name,
        {
          parent: packageState(name, versions[name][0]),
          commit: packageState(name, versions[name][1]),
        },
      ]),
    ),
    sourceCommitIsAncestor(source, parent) {
      return source === parentSha && parent === parentSha;
    },
  };
}

function ordinaryPr() {
  return {
    number: 99,
    title: "fix: ordinary maintenance",
    body: "An ordinary pull request.",
    merged_at: "2026-08-02T12:00:00Z",
    merge_commit_sha: sha,
    user: { login: "human" },
    base: { ref: "main" },
    head: { ref: "fix/ordinary", repo: { full_name: repository } },
    labels: [{ name: "maintenance" }],
  };
}

function noTransitionInput() {
  const input = inputFor();
  for (const name of packageNames)
    input.packageStates[name].commit = packageState(
      name,
      input.packageStates[name].parent.manifest.version,
    );
  input.changedPaths = ["README.md"];
  return input;
}

function expectRejected(mutator, pattern) {
  const input = inputFor();
  mutator(input);
  assert.throws(() => identifyRelease(input), pattern);
}

test("ordinary push with no associated PR is a successful no-op", () => {
  const input = inputFor();
  input.pullRequests = [];
  assert.deepEqual(identifyRelease(input), {
    trustedRelease: false,
    selectedPackage: "",
    releaseCommit: "",
  });
});

test("ordinary merged PR is a successful no-op", () => {
  const input = noTransitionInput();
  input.pullRequests = [ordinaryPr()];
  assert.deepEqual(identifyRelease(input), {
    trustedRelease: false,
    selectedPackage: "",
    releaseCommit: "",
  });
});

test("synthetic trusted pushes select exactly one package and the pushed SHA", () => {
  for (const packageName of packageNames) {
    const result = identifyRelease(inputFor(packageName));
    assert.equal(result.trustedRelease, true);
    assert.equal(result.selectedPackage, packageName);
    assert.equal(result.releaseCommit, sha);
    assert.equal(result.parentCommit, parentSha);
    assert.deepEqual(
      packageNames.map(expectedPackage => machineOutputs(result, expectedPackage).trusted_release),
      packageNames.map(expectedPackage => String(expectedPackage === packageName)),
    );
  }
});

test("spoofed or partial PR markers fail closed", () => {
  expectRejected(input => {
    input.pullRequests[0].title = `[release-prep] ${packageNames[0]}@9.9.9`;
  }, /title does not agree/);
  const labelled = noTransitionInput();
  labelled.pullRequests = [ordinaryPr()];
  labelled.pullRequests[0].labels.push({ name: "release-preparation" });
  assert.throws(() => identifyRelease(labelled), /exactly one package version transition/);
});

test("marker-free merged PR remains a no-op even when it changes a package version", () => {
  const input = inputFor();
  input.pullRequests = [ordinaryPr()];
  assert.deepEqual(identifyRelease(input), {
    trustedRelease: false,
    selectedPackage: "",
    releaseCommit: "",
  });
});

test("wrong bot, fork, branch, base, and merge SHA fail closed", () => {
  const cases = [
    [
      input => {
        input.pullRequests[0].user.login = "another-app[bot]";
      },
      /author is not/,
    ],
    [
      input => {
        input.pullRequests[0].head.repo.full_name = "attacker/fork";
      },
      /head repository/,
    ],
    [
      input => {
        input.pullRequests[0].head.ref = "release-prep/other/1.0.1/12345";
      },
      /head branch/,
    ],
    [
      input => {
        input.pullRequests[0].base.ref = "develop";
      },
      /base is not main/,
    ],
    [
      input => {
        input.pullRequests[0].merge_commit_sha = "c".repeat(40);
      },
      /merge commit/,
    ],
  ];
  for (const [mutator, pattern] of cases) expectRejected(mutator, pattern);
});

test("ambiguous associated PRs cannot publish", () => {
  expectRejected(input => {
    input.pullRequests.push(ordinaryPr());
  }, /exactly one associated preparation PR/);
});

test("unexpected paths and missing required release files cannot publish", () => {
  expectRejected(input => {
    input.changedPaths.push("README.md");
  }, /unexpected paths/);
  expectRejected(input => {
    input.changedPaths = input.changedPaths.filter(entry => !entry.endsWith("package-lock.json"));
  }, /required file/);
});

test("invalid, equal, and decreasing version transitions cannot publish", () => {
  for (const version of ["invalid", "1.0.0", "0.9.9"]) {
    expectRejected(input => {
      input.packageStates[packageNames[0]].commit = packageState(packageNames[0], version);
    }, /version|transition|increase/i);
  }
});

test("audit metadata must corroborate Git, workflow run, source lineage, and branch", () => {
  expectRejected(input => {
    input.pullRequests[0].body = input.pullRequests[0].body.replace(
      "Old version: `1.0.0`",
      "Old version: `0.1.0`",
    );
  }, /old version/);
  expectRejected(input => {
    input.pullRequests[0].body = input.pullRequests[0].body.replace(
      "github.com",
      "example.invalid",
    );
  }, /workflow run marker/);
  expectRejected(input => {
    input.sourceCommitIsAncestor = () => false;
  }, /source commit/);
  expectRejected(input => {
    input.pullRequests[0].body = input.pullRequests[0].body.replace("/12345`", "/99999`");
  }, /branch/);
});

test("exact App slug is required for release candidates", () => {
  expectRejected(input => {
    input.appSlug = "";
  }, /release App slug is required/);
});

test("publisher workflows scope privilege and preserve recovery behavior", () => {
  for (const workflow of workflows) {
    const source = fs.readFileSync(path.join(root, workflow.file), "utf8").replaceAll("\r\n", "\n");
    assert.equal(
      (source.match(new RegExp(`RELEASE_APP_SLUG: ${releaseAppSlug}`, "g")) ?? []).length,
      1,
    );
    assert.doesNotMatch(source, /vars\.RELEASE_APP_SLUG/);
    assert.match(source, /^on:\n  push:\n    branches:\n      - main$/m);
    assert.match(source, /^permissions:\n  contents: read$/m);
    assert.match(source, /^  identify-release:\n/m);
    assert.match(source, /pull-requests: read/);
    assert.doesNotMatch(
      source.match(/^  identify-release:[\s\S]*?(?=^  publish:)/m)?.[0] ?? "",
      /id-token|environment: npm-publish|contents: write/,
    );
    const publish = source.match(/^  publish:[\s\S]*$/m)?.[0] ?? "";
    assert.match(publish, /if: needs\.identify-release\.outputs\.trusted_release == 'true'/);
    assert.match(publish, /id-token: write/);
    assert.match(publish, /contents: write/);
    assert.match(publish, /environment: npm-publish/);
    assert.match(publish, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(publish, /git rev-parse HEAD/);
    assert.match(publish, /mode=verify-existing/);
    assert.match(publish, /mode=recover/);
    assert.match(publish, /releaseCommit !== process\.env\.GITHUB_SHA/);
    assert.match(publish, /git tag --annotate/);
    assert.match(source, new RegExp(`group: npm-publish-${workflow.packageName}`));
    assert.match(source, /cancel-in-progress: false/);
  }
});
