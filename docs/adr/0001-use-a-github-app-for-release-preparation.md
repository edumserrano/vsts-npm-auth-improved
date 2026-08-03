# ADR 0001: Use a GitHub App for release preparation

- Status: Accepted
- Date: 2026-08-03

## Context

The repository prepares a package release by running one of the manually dispatched prepare-release
workflows. The workflow creates a version commit on a release-preparation branch, opens a pull
request, applies release labels, and enables squash auto-merge.

The pull request is part of a larger workflow chain:

1. The `pull_request` event runs the build-and-test workflows and supplies the required checks for
   the release-preparation pull request.
2. After the pull request is merged, the `push` event on `main` runs the publish workflows.
3. The matching publish workflow validates the trusted release metadata and publishes the package.

The repository-provided `GITHUB_TOKEN` can be granted sufficient `contents`, `issues`, and
`pull-requests` permissions to push a branch and create or update a pull request. Missing permission
is therefore not the reason for using a GitHub App.

GitHub deliberately prevents most events created with a repository's `GITHUB_TOKEN` from starting
another workflow run. GitHub currently makes an exception for `pull_request` events with the
`opened`, `synchronize`, or `reopened` activity types, but workflows started by those events require
manual approval. Other events created with `GITHUB_TOKEN`, including a push, do not normally create
another workflow run.

That behavior protects repositories from accidental recursive workflow execution, but it conflicts
with this release process. Release preparation must start required pull-request checks without a
manual approval step and must allow the later push to `main` to start the publisher.

## Decision

Use the `vsts-npm-auth-release-bot` GitHub App installation for the write operations that create and
manage a release-preparation pull request.

The prepare-release workflows use `actions/create-github-app-token` to create a short-lived
installation access token with these repository permissions:

- `contents: write`, for pushing the release-preparation branch;
- `issues: write`, for applying pull-request labels; and
- `pull-requests: write`, for creating the pull request and enabling auto-merge.

The App token is used to configure Git authentication, push the release-preparation commit, create
and label the pull request, and enable squash auto-merge. These actions are attributed to
`vsts-npm-auth-release-bot[bot]`, and their resulting events are not subject to the workflow-chaining
restrictions applied to the repository's `GITHUB_TOKEN`.

The default workflow token remains the preferred credential for read-only operations. In
particular, the existing-release-PR check uses `${{ github.token }}` with only
`pull-requests: read`. The more privileged App token is created only after that check succeeds.

The App client ID is stored in the `RELEASE_APP_CLIENT_ID` repository variable. Its private key is
stored in the `VSTS_NPM_AUTH_RELEASE_BOT_PRIVATE_KEY` secret in the
`vsts-npm-auth-release-bot` environment.

## Consequences

### Positive

- Required pull-request workflows can start without manual approval.
- A merged release pull request can continue into the push-triggered publishing workflows.
- Release automation is attributed to a dedicated bot instead of a maintainer's user account.
- The installation token is short-lived and limited by the App installation and requested
  permissions.
- Read-only checks continue to use the less-privileged workflow token.

### Negative

- The repository depends on a configured and installed GitHub App.
- The App private key must be stored, protected, rotated, and revoked if compromised.
- The App installation and repository environment must retain the required permissions and values.
- The workflow must explicitly pass the short-lived App token to each step that performs an
  authenticated GitHub or remote Git operation.

## Alternatives considered

### Use only `GITHUB_TOKEN`

Rejected. It can create the branch and pull request when granted write permissions, but GitHub's
workflow-recursion controls prevent the fully automatic release chain. Pull-request workflows would
require approval, and other token-generated events may not start the next workflow.

### Use a personal access token

Rejected. A personal access token can trigger the required events, but it is tied to a user account,
has a less suitable ownership and rotation model for repository automation, and risks granting
broader or longer-lived access than the GitHub App installation token.

### Explicitly dispatch every downstream workflow

Rejected for the current design. The repository intentionally uses normal `pull_request` and
`push` events, branch rules, and trusted merged-PR metadata as the release chain. Explicit dispatch
would require a different trust and orchestration model.

## References

- [Triggering a workflow from a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
- [The `GITHUB_TOKEN` security model](https://docs.github.com/en/actions/concepts/security/github_token)
- [Making authenticated API requests with a GitHub App in a GitHub Actions workflow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)
