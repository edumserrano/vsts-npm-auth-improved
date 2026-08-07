# ADR 0001: Use a GitHub App for release preparation

- Status: Accepted
- Date: 2026-08-03

## Context

The release-preparation workflow starts manually. It creates a version commit and a pull request. It applies the package release label and enables squash auto-merge. The necessary build-and-test workflows must run automatically before the pull request can merge.

`GITHUB_TOKEN` has sufficient permission to create the branch and pull request. But GitHub's workflow-recursion protection requires approval for the resultant `pull_request` workflow runs. Thus, each release would require manual approval.

## Decision

Use the `vsts-npm-auth-release-bot` GitHub App to create and manage release-preparation pull requests. Events that use its short-lived installation token can start the necessary workflows without manual approval.

The workflow creates the token with `actions/create-github-app-token` and requests only:

- `contents: write`, for pushing the release-preparation branch;
- `issues: write`, for applying pull-request labels; and
- `pull-requests: write`, for creating the pull request and enabling auto-merge.

Use the App token only to push the commit and create, label, and configure the pull request. Continue using `${{ github.token }}` for read-only checks, and create the App token only after those checks pass.

Publication stays separate. After the merge, `publish-merged-release-pr.yml` publishes the selected package from the exact pushed commit. It uses the protected `npm-publish` environment and npm trusted publishing. The publish job does not use the App token.

The App client ID is stored in the `RELEASE_APP_CLIENT_ID` repository variable. Its private key is stored in the `VSTS_NPM_AUTH_RELEASE_BOT_PRIVATE_KEY` secret in the `vsts-npm-auth-release-bot` environment.

## Consequences

### Positive

- Required pull-request workflows can start without manual approval.
- Release actions are attributed to a dedicated bot rather than a maintainer.
- The App token is short-lived and limited to the required write permissions.
- Publishing retains its existing protected, OIDC-based trust boundary.

### Negative

- The repository depends on a configured and installed GitHub App.
- The private key and App configuration must be protected and maintained.
- Authenticated GitHub and Git steps must receive the App token explicitly.

## Alternatives considered

### Use only `GITHUB_TOKEN`

This alternative does not permit automatic merge without supervision. Pull-request workflows that `GITHUB_TOKEN` creates require manual approval.

### Use a personal access token

This alternative connects the token to a user account. It can give more permissions or longer access than an App installation token.

### Explicitly dispatch the required pull-request checks

This alternative would duplicate the normal `pull_request` check sequence. It would make the behavior of necessary checks difficult to follow.

## References

- [Triggering a workflow from a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
- [The `GITHUB_TOKEN` security model](https://docs.github.com/en/actions/concepts/security/github_token)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Making authenticated API requests with a GitHub App in a GitHub Actions workflow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)
