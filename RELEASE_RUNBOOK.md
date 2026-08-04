# Release runbook

This repository releases `vsts-npm-auth-improved` and `create-vsts-npm-auth-improved`
independently. A maintainer chooses a version by manually starting a package preparation workflow
from `main`; that workflow prepares a pull request, waits for its checks and squash merge, and lets
the matching push-triggered publisher create the Git tag and then publish to npm.

Do not publish with a local `npm publish`, create a release tag manually, or bypass the preparation
pull request. The automated publisher binds the npm provenance and annotated tag to the exact squash
commit.

## Start a release

In GitHub Actions, open the `Prepare release` workflow. Run it from branch `main`, select either
`vsts-npm-auth-improved` or `create-vsts-npm-auth-improved` in the `package` input, and set `version`
as follows:

- Use `auto` for the normal release. A stable version gets a patch increment. A prerelease keeps its
  channel and increments its number: for example, `1.0.0-alpha.2` becomes `1.0.0-alpha.3`.
- Enter an explicit SemVer such as `1.0.0-beta.0`, `1.0.0-rc.0`, or `1.0.0` to choose that exact
  version. The version must be greater than the current version, use only the supported `alpha.N`,
  `beta.N`, or `rc.N` prerelease form, and be absent from both npm and Git tags.

`auto` never promotes a channel. Promotion from `alpha` to `beta`, `beta` to `rc`, or any prerelease
to stable therefore requires an explicit version.

The equivalent GitHub CLI commands are:

```shell
gh workflow run prepare-release.yml --ref main -f package=vsts-npm-auth-improved -f version=auto
gh workflow run prepare-release.yml --ref main -f package=create-vsts-npm-auth-improved -f version=auto
```

Replace `auto` with the explicit version when promoting or selecting a version. The separate build
and test workflows can still be dispatched manually without inputs and never mint the release App
token or mutate the repository or npm.

## Follow the automatic release

The preparation workflow updates version-derived snapshots, builds, and tests the bumped package
before it creates the pull request. The generated pull request can be recognized by all of these
markers:

- author `vsts-npm-auth-release-bot[bot]`;
- title `[release-prep] <package>@<version>`;
- branch `release-prep/<package>/<version>/<workflow-run-id>` in this repository;
- labels `release-preparation` and `release-package:<package>`; and
- a body recording the package, old and new versions, source commit, workflow run, and branch.

Its diff is limited to that package's `package.json`, `package-lock.json`, and any version-derived
`tests/__snapshots__/*.snap` files. Unexpected files are a failure, not something to approve
manually.

Preparation is serialized separately for each package and holds its lock for the complete pull
request lifecycle. A second run for the same package waits while the first run owns the lock. If a
failed or timed-out run leaves a marked pull request open, the open-PR guard rejects the next run;
fix and merge that pull request, or close it, before starting another preparation. Do not close a
healthy pull request merely because another run is queued.

If the pull request falls behind `main`, the preparation job requests a branch update. Both required
checks rerun against the updated head before squash auto-merge:

- `Build and test vsts-npm-auth-improved`
- `Build and test create-vsts-npm-auth-improved`

Ruleset `main-rules` (ID `20251131`) is active for `main` and requires those two GitHub Actions
checks with strict/up-to-date enforcement. The repository owner has intentionally omitted a
required-pull-request rule and a force-push rule; those omissions are not an alternative release
path. Confirm that the ruleset remains active and strict if a preparation pull request appears able
to merge with stale or pending checks.

After the squash merge, the publish workflow inspects the push to `main` and enters its `publish`
job only when the package and trusted pull-request metadata match:

| Package                                          | Publisher                       | npm tag                  | Git tag               |
| ------------------------------------------------ | ------------------------------- | ------------------------ | --------------------- |
| either package at a stable version               | matching `Publish ...` workflow | `latest`                 | `<package>@<version>` |
| either package at `alpha.N`, `beta.N`, or `rc.N` | matching `Publish ...` workflow | `alpha`, `beta`, or `rc` | `<package>@<version>` |

The publisher builds, tests, packs, inspects, and smoke-tests the tarball before publishing through
npm trusted publishing in the `npm-publish` environment. It then verifies the exact npm version,
the channel's dist-tag, and a SLSA provenance v1 attestation. The attestation must identify this
repository, `refs/heads/main`, the matching publisher workflow file, the npm package/version
subject, and the exact push commit. Finally, it creates an annotated tag at that same commit.

## Diagnose and recover

Start with the failed step and its logs. These Bash examples are read-only; replace the values before
running them:

```shell
RUN_ID=replace-me
PR_NUMBER=replace-me
PACKAGE=vsts-npm-auth-improved
VERSION=replace-me

gh run view "$RUN_ID" --log-failed
gh pr checks "$PR_NUMBER" --required
npm view "$PACKAGE@$VERSION" version
npm view "$PACKAGE@$VERSION" dist-tags
npm view "$PACKAGE@$VERSION" dist.attestations.url
git ls-remote origin "refs/tags/$PACKAGE@$VERSION" "refs/tags/$PACKAGE@$VERSION^{}"
```

Use the following recovery according to where the chain stopped:

- **Preparation:** A failure before pull-request creation normally reports an invalid dispatch ref,
  version, existing npm version/tag, missing release label, App credential problem, unexpected diff,
  or build/test failure. Correct the configuration or fix `main` through a normal pull request, then
  start preparation again. If a preparation pull request exists, resolve or close it first.
- **Required CI:** Inspect both exact checks above. Rerun a transient failed check. For a real source
  or test defect, close the preparation pull request, land the fix on `main` normally, and prepare
  again; adding source fixes to the preparation branch would violate its release-file allowlist.
- **Behind `main`:** While the preparation job is alive, allow it to update the branch and rerun the
  checks. If the automatic update itself failed, inspect the preparation lifecycle step for
  permissions or merge conflicts. A maintainer can request the same guarded update with:

  ```shell
  PR_NUMBER=replace-me
  head_sha="$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)"
  gh api --method PUT "repos/edumserrano/vsts-npm-auth-improved/pulls/$PR_NUMBER/update-branch" -f "expected_head_sha=$head_sha"
  ```

  If the branch is conflicted, close it, fix `main`, and start a fresh preparation.

- **Auto-merge:** Verify that both required checks passed on the current head, the branch is not
  behind or conflicted, repository auto-merge is enabled, squash is allowed, and ruleset `20251131`
  is active and strict. If auto-merge was merely disabled on the pull request, restore the requested
  mode with `gh pr merge "$PR_NUMBER" --auto --squash`. Never force-merge a failing or stale
  preparation.
- **Release identification:** An ordinary push is an intentional successful no-op. For a preparation
  squash, inspect `Identify release`. A mismatch in App author, source repository, release branch,
  labels, changed files, package metadata, version transition, associated pull request, or squash SHA
  fails closed. Do not edit markers to force publication; determine why the generated pull request or
  merge no longer matches the trusted shape.
- **Build or pack:** Inspect the matching `Publish <package>` workflow. These steps run before the
  release tag is created, so fix a genuine package defect with a new release version or rerun a
  transient failure normally.
- **Tag:** Tag creation and push run before `npm publish`. If either fails, npm is not attempted. Check
  whether the remote tag exists before rerunning: a rejected push can still have reached GitHub. If
  the tag is absent, rerun the failed publisher job. If the tag exists, use the recovery procedure
  below.
- **npm publish:** A publish failure can leave the release tag on GitHub. First check whether npm
  accepted the version despite the reported failure. If it did, retain the tag and verify the
  published package and provenance. If npm does not have the version, use the recovery procedure
  below to remove the stranded tag before rerunning or preparing a corrected release. npm
  trusted-publisher configuration for both packages must name the calling workflow:
  `.github/workflows/publish-merged-release-pr.yml`. The package-specific steps are implemented by
  the shared `.github/actions/publish-package/action.yml` composite action.
- **npm verification or provenance:** If provenance exists but identifies a different repository,
  ref, workflow, subject, or commit, stop: do not delete or move the tag and do not try to overwrite
  the npm version. Compare the attestation URL and release squash SHA, then investigate the npm
  trusted-publisher configuration and the original workflow run.

### Recover a stranded tag after publication fails

Only remove a release tag after confirming that npm does not contain the package version and that
the tag peels to the original release squash commit. Find the failed push-triggered publisher by
workflow file and squash commit, inspect the npm package page and provenance, and verify the remote
tag:

```shell
RELEASE_SHA=replace-me
PUBLISH_RUN_ID=replace-me
RELEASE_TAG=replace-me

gh run list --workflow publish-merged-release-pr.yml --commit "$RELEASE_SHA" --json databaseId,conclusion,url,headSha
git ls-remote origin "refs/tags/$RELEASE_TAG" "refs/tags/$RELEASE_TAG^{}"
```

Stop if npm contains the version, the tag is missing, or the peeled tag commit does not equal
`RELEASE_SHA`. After those checks pass, delete only the stranded remote tag and rerun the original
failed job, preserving its original event SHA:

```shell
git push origin --delete "refs/tags/$RELEASE_TAG"
gh run rerun "$PUBLISH_RUN_ID" --failed
```

Do not dispatch another preparation, make an empty push, or create or move the tag locally. On
rerun, the publisher uses the original merged release commit and recreates the tag before attempting
publication.

## Rotate or revoke the release App key

The App slug is `vsts-npm-auth-release-bot`. Its client ID is the repository variable
`RELEASE_APP_CLIENT_ID`; its PEM private key is the `RELEASE_APP_PRIVATE_KEY` secret in the
`release-preparation` environment. The key is available only to a manually enabled preparation job,
which mints a short-lived repository-scoped token with Contents, Issues, and Pull requests write
permissions.

For planned rotation:

1. Generate a second private key in the release GitHub App's settings.
2. Replace `RELEASE_APP_PRIVATE_KEY` in the `release-preparation` environment with the complete new
   PEM value.
3. Validate it during the next controlled release preparation. There is no checked-in
   non-publishing credential-check workflow; the separate build and test workflows do not read the
   key.
4. After the new key successfully creates the correctly App-authored preparation pull request,
   delete the old key in the App settings.

If a key may be exposed, delete it from the App settings immediately, suspend or uninstall the App
while investigating if necessary, review its recent activity and repository audit information, and
generate and store a replacement. Treat already minted installation tokens as compromised until
they expire or are revoked. Suspending or uninstalling the App prevents it from minting useful new
repository installation tokens; an open preparation pull request must then be resolved before a new
release can start.
