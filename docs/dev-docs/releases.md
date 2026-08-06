# Creating releases

Releases are created through GitHub Actions. Do not edit a package version, create a release tag,
or run `npm publish` manually.

## Manual release

1. Open the repository's **Actions** tab and select the
   [`Prepare release`](../../.github/workflows/prepare-release.yml) workflow.
2. Choose `vsts-npm-auth-improved` or `create-vsts-npm-auth-improved`.
3. Enter `auto` or an explicit supported SemVer version. `auto` increments an existing prerelease
   with `prerelease`; otherwise it increments `patch`. Explicit prereleases may use `alpha.N`,
   `beta.N`, or `rc.N`.
4. Run the workflow. It verifies that the npm version and package-specific Git tag are available,
   updates the selected package's `package.json` and `package-lock.json`, and opens a
   `[release-prep]` pull request as `vsts-npm-auth-release-bot[bot]`.
5. The workflow labels the pull request and enables squash auto-merge. Required package checks run
   normally; when they pass, GitHub merges the release preparation pull request automatically.
6. The merge to `main` starts
   [`Publish merged release PR`](../../.github/workflows/publish-merged-release-pr.yml). It validates
   the bot, labels, changed files, version increase, and exact merge commit before publishing.
7. The publisher builds and inspects the package tarball, smoke-tests its executable, creates and
   pushes `<package>@<version>`, and publishes the tarball to npm using trusted publishing. Stable
   versions receive the `latest` npm dist-tag; prereleases receive the identifier as their dist-tag,
   such as `alpha`, `beta`, or `rc`.
8. After npm succeeds, the workflow creates a GitHub Release with the tarball and its SHA-256 file.

The release workflow is intentionally not manually dispatchable. Merging the validated release
preparation pull request is the only publishing trigger.

## Dependabot releases

Dependabot dependency updates create releases automatically for the affected npm package:

1. [Dependabot](../../.github/dependabot.yml) opens a package-scoped pull request with either the
   `dependabot-package:vsts-npm-auth-improved` or
   `dependabot-package:create-vsts-npm-auth-improved` label.
2. The repository enables squash auto-merge for the Dependabot pull request. It merges after the
   required checks pass.
3. The push to `main` runs
   [`Prepare releases after merged Dependabot PR`](../../.github/workflows/prepare-releases-after-merged-dependabot-pr.yml).
   The workflow verifies the Dependabot author, merge commit, changed package paths, and package
   label, then dispatches `Prepare release` for that package with version `auto`.
4. The generated release preparation pull request passes checks and auto-merges, after which the
   normal npm publishing, package tagging, and GitHub Release steps run without maintainer action.

If any required check or release validation fails, auto-merge or publishing stops. Inspect the
linked workflow run, correct the underlying problem in a normal pull request, and rerun `Prepare
release` when the package is ready. The workflow refuses to prepare a second release while an open
release preparation pull request already exists for the same package.

## Release security

Release preparation uses a narrowly scoped GitHub App so its pull request can start required
workflows. npm publication uses OIDC trusted publishing from the protected `npm-publish`
environment. See
[ADR 0001](adr/0001-use-a-github-app-for-release-preparation.md) for the rationale and credential
boundaries.
