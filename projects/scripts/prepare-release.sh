#!/usr/bin/env bash
set -Eeuo pipefail

readonly WAIT_TIMEOUT_SECONDS=2100
readonly POLL_INTERVAL_SECONDS=20
readonly CORE_CHECK_NAME="Build and test vsts-npm-auth-improved"
readonly CREATE_CHECK_NAME="Build and test create-vsts-npm-auth-improved"

fail() {
  echo "release preparation failed: $*" >&2
  exit 1
}

require_value() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "required environment value $name is missing"
}

require_repository_label() {
  local label="$1"
  local encoded_label
  if ! encoded_label="$(jq -rn --arg value "$label" '$value | @uri')"; then
    fail "could not URL-encode required repository label '$label'"
  fi
  [[ -n "$encoded_label" ]] || fail "URL encoding produced an empty value for required repository label '$label'"

  if ! gh api --method GET "repos/$GITHUB_REPOSITORY/labels/$encoded_label" --silent; then
    fail "required repository label '$label' is missing or its exact GitHub API lookup failed"
  fi
}

require_value APP_SLUG
require_value GH_TOKEN
require_value GITHUB_EVENT_NAME
require_value GITHUB_REF
require_value GITHUB_REPOSITORY
require_value GITHUB_RUN_ID
require_value GITHUB_SERVER_URL
require_value PACKAGE_NAME
require_value REQUESTED_VERSION
require_value RUNNER_TEMP

[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || fail "preparation is allowed only for workflow_dispatch"
[[ "$GITHUB_REF" == "refs/heads/main" ]] || fail "preparation must be dispatched from refs/heads/main"

case "$PACKAGE_NAME" in
  vsts-npm-auth-improved | create-vsts-npm-auth-improved)
    ;;
  *)
    fail "unsupported package: $PACKAGE_NAME"
    ;;
esac

readonly PACKAGE_DIR="projects/$PACKAGE_NAME"
readonly PACKAGE_LABEL="release-package:$PACKAGE_NAME"
readonly BRANCH_PREFIX="release-prep/$PACKAGE_NAME/"
readonly TITLE_PREFIX="[release-prep] $PACKAGE_NAME@"
REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"
readonly REPOSITORY_ROOT
cd "$REPOSITORY_ROOT"

initial_status="$(git status --porcelain --untracked-files=normal)"
[[ -z "$initial_status" ]] || fail "checkout is not clean before preparation"

# Git stores only the gh credential-helper command; the short-lived App token
# remains in GH_TOKEN and is used for every fetch and push in this step.
gh auth setup-git

# checkout@v6 already fetched full history. Fetch main and all tags again before
# conflict checks so both the preparation base and tag namespace are current.
git fetch --force origin main:refs/remotes/origin/main
git fetch --force --tags origin
git merge-base --is-ancestor HEAD refs/remotes/origin/main || fail "checked-out main is not an ancestor of origin/main"
local_head="$(git rev-parse HEAD)"
remote_main="$(git rev-parse refs/remotes/origin/main)"
if [[ "$local_head" != "$remote_main" ]]; then
  git merge --ff-only refs/remotes/origin/main
fi
SOURCE_COMMIT="$(git rev-parse HEAD)"
readonly SOURCE_COMMIT

for label in release-preparation "$PACKAGE_LABEL"; do
  require_repository_label "$label"
done

# REST pagination avoids silently missing a marked PR in a repository with more
# than one page of open pull requests.
open_prs_json="$(gh api --paginate --slurp \
  "repos/$GITHUB_REPOSITORY/pulls?state=open&base=main&per_page=100")"
matching_open_prs="$(jq \
  --arg branch_prefix "$BRANCH_PREFIX" \
  --arg title_prefix "$TITLE_PREFIX" \
  --arg package_label "$PACKAGE_LABEL" \
  '[.[] | .[] | select(
    (.head.ref | startswith($branch_prefix)) or
    (.title | startswith($title_prefix)) or
    (([.labels[].name] | index("release-preparation")) and
      ([.labels[].name] | index($package_label)))
  )]' <<<"$open_prs_json")"
open_pr_count="$(jq 'length' <<<"$matching_open_prs")"
if ((open_pr_count > 0)); then
  jq -r '.[] | "open preparation PR #\(.number): \(.html_url)"' <<<"$matching_open_prs" >&2
  fail "an open release-preparation PR already exists for $PACKAGE_NAME"
fi

npm ci --prefix "$PACKAGE_DIR"

resolution_json="$(node projects/scripts/release-tool-cli.cjs resolve-version \
  --package-dir "$PACKAGE_DIR" \
  --requested "$REQUESTED_VERSION")"
OLD_VERSION="$(jq -er '.currentVersion' <<<"$resolution_json")"
NEW_VERSION="$(jq -er '.version' <<<"$resolution_json")"
readonly OLD_VERSION NEW_VERSION

node projects/scripts/release-tool-cli.cjs check-conflicts \
  --package-dir "$PACKAGE_DIR" \
  --version "$NEW_VERSION"

(
  cd "$PACKAGE_DIR"
  npm version "$NEW_VERSION" --no-git-tag-version
  npm run test:update-snapshots
  npm ci
  npm run build
  npm test
)

node projects/scripts/release-tool-cli.cjs validate-diff \
  --package-dir "$PACKAGE_DIR" \
  --base "$SOURCE_COMMIT"
git diff --check "$SOURCE_COMMIT"

for required_path in "$PACKAGE_DIR/package.json" "$PACKAGE_DIR/package-lock.json"; do
  git diff --name-only "$SOURCE_COMMIT" -- | grep -Fqx "$required_path" || fail "expected version file did not change: $required_path"
done

readonly PREPARATION_BRANCH="$BRANCH_PREFIX$NEW_VERSION/$GITHUB_RUN_ID"
git check-ref-format --branch "$PREPARATION_BRANCH" >/dev/null || fail "generated preparation branch is invalid"
remote_branch="$(git ls-remote --heads origin "refs/heads/$PREPARATION_BRANCH")"
if [[ -n "$remote_branch" ]]; then
  fail "preparation branch already exists: $PREPARATION_BRANCH"
fi
git switch --create "$PREPARATION_BRANCH"

readonly BOT_LOGIN="${APP_SLUG}[bot]"
BOT_ID="$(gh api "/users/$BOT_LOGIN" --jq '.id')"
readonly BOT_ID
[[ "$BOT_ID" =~ ^[0-9]+$ ]] || fail "could not resolve the release App bot ID"
git config user.name "$BOT_LOGIN"
git config user.email "${BOT_ID}+${BOT_LOGIN}@users.noreply.github.com"

git add -- "$PACKAGE_DIR/package.json" "$PACKAGE_DIR/package-lock.json"
if [[ -d "$PACKAGE_DIR/tests/__snapshots__" ]]; then
  git add -- "$PACKAGE_DIR/tests/__snapshots__"
fi

node projects/scripts/release-tool-cli.cjs validate-diff \
  --package-dir "$PACKAGE_DIR" \
  --base "$SOURCE_COMMIT"
git diff --quiet || fail "allowed preparation files contain unstaged changes"
untracked_files="$(git ls-files --others --exclude-standard)"
[[ -z "$untracked_files" ]] || fail "preparation left unexpected untracked files"
git diff --cached --quiet && fail "preparation produced no version changes"

git commit -m "chore(release): prepare $PACKAGE_NAME@$NEW_VERSION"

git push --set-upstream origin "$PREPARATION_BRANCH"

readonly PR_BODY="$RUNNER_TEMP/release-preparation-$GITHUB_RUN_ID.md"
cat >"$PR_BODY" <<EOF
Automated release preparation.

- Package: \`$PACKAGE_NAME\`
- Old version: \`$OLD_VERSION\`
- New version: \`$NEW_VERSION\`
- Source commit: \`$SOURCE_COMMIT\`
- Workflow run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID
- Preparation branch: \`$PREPARATION_BRANCH\`
EOF

PR_URL="$(gh pr create \
  --repo "$GITHUB_REPOSITORY" \
  --base main \
  --head "$PREPARATION_BRANCH" \
  --title "$TITLE_PREFIX$NEW_VERSION" \
  --body-file "$PR_BODY")"
readonly PR_URL
PR_NUMBER="$(gh pr view "$PR_URL" --repo "$GITHUB_REPOSITORY" --json number --jq '.number')"
readonly PR_NUMBER
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || fail "created preparation PR could not be identified unambiguously"

gh pr edit "$PR_URL" \
  --repo "$GITHUB_REPOSITORY" \
  --add-label release-preparation \
  --add-label "$PACKAGE_LABEL"
gh pr merge "$PR_URL" --repo "$GITHUB_REPOSITORY" --auto --squash

started_waiting_at="$(date +%s)"
readonly DEADLINE="$((started_waiting_at + WAIT_TIMEOUT_SECONDS))"
echo "Waiting up to $WAIT_TIMEOUT_SECONDS seconds for preparation PR #$PR_NUMBER to merge."

while :; do
  current_time="$(date +%s)"
  ((current_time < DEADLINE)) || break
  pr_json="$(gh pr view "$PR_NUMBER" \
    --repo "$GITHUB_REPOSITORY" \
    --json state,mergedAt,mergeStateStatus,headRefOid,url)" || fail "could not read preparation PR #$PR_NUMBER"

  merged_at="$(jq -r '.mergedAt // empty' <<<"$pr_json")"
  if [[ -n "$merged_at" ]]; then
    echo "Preparation PR #$PR_NUMBER merged at $merged_at."
    exit 0
  fi

  pr_state="$(jq -r '.state' <<<"$pr_json")"
  [[ "$pr_state" == "OPEN" ]] || fail "preparation PR #$PR_NUMBER was closed without merging"

  merge_state="$(jq -r '.mergeStateStatus' <<<"$pr_json")"
  if [[ "$merge_state" == "DIRTY" ]]; then
    fail "preparation PR #$PR_NUMBER has merge conflicts"
  fi
  if [[ "$merge_state" == "BEHIND" ]]; then
    head_oid="$(jq -er '.headRefOid' <<<"$pr_json")"
    echo "Preparation PR #$PR_NUMBER is behind main; requesting a branch update."
    gh api \
      --method PUT \
      "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/update-branch" \
      -f "expected_head_sha=$head_oid" >/dev/null || fail "GitHub could not update preparation PR #$PR_NUMBER"
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  checks_status=0
  checks_json="$(gh pr checks "$PR_NUMBER" \
    --repo "$GITHUB_REPOSITORY" \
    --required \
    --json name,state,bucket)" || checks_status=$?
  if ((checks_status != 0 && checks_status != 1 && checks_status != 8)); then
    fail "could not read required checks for preparation PR #$PR_NUMBER (gh exit $checks_status)"
  fi
  jq -e 'type == "array"' <<<"$checks_json" >/dev/null || fail "required-check response was not an unambiguous JSON array"

  if jq -e '.[] | select(.bucket == "fail" or .bucket == "cancel")' <<<"$checks_json" >/dev/null; then
    jq -r '.[] | select(.bucket == "fail" or .bucket == "cancel") | "failed required check: \(.name) (\(.state))"' <<<"$checks_json" >&2
    fail "a required check failed for preparation PR #$PR_NUMBER"
  fi

  checks_ready=true
  for expected_check in "$CORE_CHECK_NAME" "$CREATE_CHECK_NAME"; do
    check_count="$(jq --arg name "$expected_check" '[.[] | select(.name == $name)] | length' <<<"$checks_json")"
    if ((check_count > 1)); then
      fail "required check '$expected_check' is ambiguous for preparation PR #$PR_NUMBER"
    fi
    if ((check_count == 0)); then
      checks_ready=false
    fi
  done
  if jq -e '.[] | select(.bucket == "pending")' <<<"$checks_json" >/dev/null; then
    checks_ready=false
  fi

  if [[ "$checks_ready" == "true" ]]; then
    echo "All required checks passed; waiting for GitHub to complete squash auto-merge."
  else
    echo "Required checks are pending for preparation PR #$PR_NUMBER."
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

fail "timed out after $WAIT_TIMEOUT_SECONDS seconds waiting for preparation PR #$PR_NUMBER; the open marked PR blocks another preparation"
