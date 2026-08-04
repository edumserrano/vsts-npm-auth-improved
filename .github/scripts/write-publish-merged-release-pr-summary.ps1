param(
  [Parameter(Mandatory)]
  [string] $PackageName,
  [string] $OldVersion,
  [string] $NewVersion,
  [Parameter(Mandatory)]
  [string] $PullRequestNumber,
  [Parameter(Mandatory)]
  [string] $PullRequestUrl,
  [Parameter(Mandatory)]
  [string] $SourceCommit,
  [Parameter(Mandatory)]
  [string] $PublishOutcome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$unavailable = "Unavailable"
$oldVersionDisplay = if ([string]::IsNullOrWhiteSpace($OldVersion)) { $unavailable } else { $OldVersion }
$newVersionDisplay = if ([string]::IsNullOrWhiteSpace($NewVersion)) { $unavailable } else { $NewVersion }
$commitDisplay = $unavailable
if ($SourceCommit -match '^[0-9a-f]{40}$') {
  $shortCommit = $SourceCommit.Substring(0, 7)
  $commitUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/commit/$SourceCommit"
  $commitDisplay = "[$shortCommit]($commitUrl)"
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 🚀 $PackageName release")
$summary.Add("")
$summary.Add("- **Version:** ``$oldVersionDisplay`` → ``$newVersionDisplay``")
$summary.Add("- **Preparation PR:** [#$PullRequestNumber]($PullRequestUrl)")
$summary.Add("- **Merge commit:** $commitDisplay")
$summary.Add("")
$summary.Add("## 📦 Publish result")
$summary.Add("")
$result = switch ($PublishOutcome) {
  "success" { "✅ Package published successfully" }
  "failure" { "❌ Package publish failed" }
  "cancelled" { "🚫 Package publish was cancelled" }
  default { "⏭️ Package publish was skipped" }
}
$summary.Add($result)

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
