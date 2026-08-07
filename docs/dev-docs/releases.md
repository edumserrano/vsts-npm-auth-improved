# Creating releases

Releases are created through GitHub Actions. Do not edit a package version, create a release tag, or run `npm publish` manually.

## Manual release

1. Open the repository's **Actions** tab and select the [`Prepare release`](../../.github/workflows/prepare-release.yml) workflow.
2. Choose `vsts-npm-auth-improved` or `create-vsts-npm-auth-improved`.
3. Enter `auto` or a supported SemVer version. For an existing prerelease, `auto` increments `prerelease`. For other versions, it increments `patch`. An explicit prerelease can use `alpha.N`, `beta.N`, or `rc.N`.
4. Run the workflow. It makes sure that the npm version and package-specific Git tag are available. It updates the selected package's `package.json` and `package-lock.json`. Then, `vsts-npm-auth-release-bot[bot]` opens a `[release-prep]` pull request.
5. The workflow labels the pull request and enables squash auto-merge. The necessary package checks run. When the checks pass, GitHub automatically merges the release preparation pull request.
6. The merge to `main` starts [`Publish merged release PR`](../../.github/workflows/publish-merged-release-pr.yml). Before publication, this workflow validates the bot, labels, changed files, version increase, and exact merge commit.
7. The publisher builds and examines the package tarball. It does a smoke test of the executable and creates and pushes `<package>@<version>`. Then, it publishes the tarball to npm with trusted publishing. Stable versions receive the `latest` npm dist-tag. Prereleases receive the applicable identifier, such as `alpha`, `beta`, or `rc`.
8. When npm publication is successful, the workflow creates a GitHub Release. The release contains the tarball and its SHA-256 file.

You cannot start the release workflow manually. Only a merge of the validated release preparation pull request starts publication.

## Dependabot releases

Dependabot dependency updates create releases automatically for the affected npm package:

1. [Dependabot](../../.github/dependabot.yml) opens a package-scoped pull request with either the `dependabot-package:vsts-npm-auth-improved` or `dependabot-package:create-vsts-npm-auth-improved` label.
2. The repository enables squash auto-merge for the Dependabot pull request. GitHub merges it after the necessary checks pass.
3. The push to `main` runs [`Prepare releases after merged Dependabot PR`](../../.github/workflows/prepare-releases-after-merged-dependabot-pr.yml). The workflow verifies the Dependabot author, merge commit, changed package paths, and package label. Then, it starts `Prepare release` for that package with version `auto`.
4. The generated release preparation pull request passes its checks and merges automatically. The usual npm publication, package tag, and GitHub Release steps then run without maintainer action.

If a necessary check or release validation fails, automatic merge or publication stops. Examine the linked workflow run. Correct the problem in a normal pull request. Run `Prepare release` again when the package is ready. The workflow does not prepare a second release if an open release preparation pull request exists for the same package.

## Release security

Release preparation uses a GitHub App with limited permissions. Thus, its pull request can start the necessary workflows. npm publication uses OIDC trusted publishing from the protected `npm-publish` environment. Refer to [ADR 0001](adr/0001-use-a-github-app-for-release-preparation.md) for the reasons and credential boundaries.
