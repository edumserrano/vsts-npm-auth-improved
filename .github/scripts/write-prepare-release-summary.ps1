param(
  [Parameter(Mandatory)]
  [string] $PackageName,
  [string] $RequestedVersion,
  [string] $OldVersion,
  [string] $NewVersion,
  [string] $ReleaseTag,
  [string] $SourceCommit,
  [string] $PreparationBranch,
  [string] $NpmCheckOutcome,
  [string] $GitTagCheckOutcome,
  [string] $PullRequestOutcome,
  [string] $PullRequestNumber,
  [string] $PullRequestUrl,
  [string] $PullRequestTitle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$unavailable = "Unavailable"
$requestedVersionDisplay = if ([string]::IsNullOrWhiteSpace($RequestedVersion)) { $unavailable } else { $RequestedVersion }
$versionChangeDisplay = if (
  [string]::IsNullOrWhiteSpace($OldVersion) -or
  [string]::IsNullOrWhiteSpace($NewVersion)
) {
  $unavailable
} else {
  "$OldVersion → $NewVersion"
}
$releaseTagDisplay = if ([string]::IsNullOrWhiteSpace($ReleaseTag)) { $unavailable } else { $ReleaseTag }
$branchDisplay = if ([string]::IsNullOrWhiteSpace($PreparationBranch)) { $unavailable } else { $PreparationBranch }

$sourceCommitDisplay = $unavailable
if (-not [string]::IsNullOrWhiteSpace($SourceCommit)) {
  $shortSourceCommit = $SourceCommit.Substring(0, [Math]::Min(7, $SourceCommit.Length))
  if (
    -not [string]::IsNullOrWhiteSpace($env:GITHUB_SERVER_URL) -and
    -not [string]::IsNullOrWhiteSpace($env:GITHUB_REPOSITORY)
  ) {
    $sourceCommitUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/commit/$SourceCommit"
    $sourceCommitDisplay = "[$shortSourceCommit]($sourceCommitUrl)"
  } else {
    $sourceCommitDisplay = $shortSourceCommit
  }
}

$npmAvailability = switch ($NpmCheckOutcome) {
  "success" { "📦 npm version is available" }
  "failure" { "❌ npm version availability check failed" }
  "skipped" { "⏭️ npm version was not checked" }
  default { "❓ npm version availability is unknown" }
}
$gitTagAvailability = switch ($GitTagCheckOutcome) {
  "success" { "🏷️ Git tag is available" }
  "failure" { "❌ Git tag availability check failed" }
  "skipped" { "⏭️ Git tag was not checked" }
  default { "❓ Git tag availability is unknown" }
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 🚀 $PackageName release preparation")
$summary.Add("")
$summary.Add("| Release | Value |")
$summary.Add("| --- | --- |")
$summary.Add('| Requested version | `{0}` |' -f $requestedVersionDisplay)
$summary.Add('| Version change | `{0}` |' -f $versionChangeDisplay)
$summary.Add('| Release tag | `{0}` |' -f $releaseTagDisplay)
$summary.Add("| Source commit | $sourceCommitDisplay |")
$summary.Add('| Preparation branch | `{0}` |' -f $branchDisplay)
$summary.Add("")
$summary.Add("## ✅ Availability")
$summary.Add("")
$summary.Add("- $npmAvailability")
$summary.Add("- $gitTagAvailability")
$summary.Add("")
$summary.Add("## 🔀 Pull request")
$summary.Add("")

if ($PullRequestOutcome -eq "success") {
  $pullRequestLabel = if ([string]::IsNullOrWhiteSpace($PullRequestNumber)) { "Open PR" } else { "#$PullRequestNumber" }
  $summary.Add("- **PR:** [$pullRequestLabel]($PullRequestUrl) — ``$PullRequestTitle``")
  $summary.Add("- **Merge:** ✅ Automatic squash merge enabled")
} elseif ($PullRequestOutcome -eq "failure") {
  if (-not [string]::IsNullOrWhiteSpace($PullRequestUrl)) {
    $pullRequestLabel = if ([string]::IsNullOrWhiteSpace($PullRequestNumber)) { "Open PR" } else { "#$PullRequestNumber" }
    $summary.Add("- **PR:** ❌ Setup failed for [$pullRequestLabel]($PullRequestUrl) — ``$PullRequestTitle``")
  } else {
    $summary.Add("- **PR:** ❌ Creation failed")
  }
  $summary.Add("- **Merge:** Automatic squash merge was not confirmed")
} else {
  $summary.Add("- **PR:** Not created")
  $summary.Add("- **Merge:** Not enabled")
}

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
