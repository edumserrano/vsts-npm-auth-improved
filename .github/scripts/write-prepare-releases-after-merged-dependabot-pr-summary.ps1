param(
  [Parameter(Mandatory)]
  [string] $SourceCommit,
  [string] $PackageName,
  [string] $PullRequestNumber,
  [string] $PullRequestUrl,
  [Parameter(Mandatory)]
  [string] $IdentificationJobOutcome,
  [Parameter(Mandatory)]
  [string] $DispatchJobOutcome,
  [string] $PrepareReleaseRunUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$unavailable = "Unavailable"
$packageDisplay = if ([string]::IsNullOrWhiteSpace($PackageName)) { $unavailable } else { "``$PackageName``" }
$pullRequestDisplay = $unavailable
if (
  $PullRequestNumber -match '^[1-9]\d*$' -and
  -not [string]::IsNullOrWhiteSpace($PullRequestUrl)
) {
  $pullRequestDisplay = "[#$PullRequestNumber]($PullRequestUrl)"
}

$commitDisplay = $unavailable
if ($SourceCommit -match '^[0-9a-f]{40}$') {
  $shortCommit = $SourceCommit.Substring(0, 7)
  $commitUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/commit/$SourceCommit"
  $commitDisplay = "[$shortCommit]($commitUrl)"
}

$identificationResult = switch ($IdentificationJobOutcome) {
  "success" { "✅ Succeeded" }
  "failure" { "❌ Failed" }
  "cancelled" { "🚫 Cancelled" }
  default { "⏭️ Skipped" }
}

$dispatchResult = switch ($DispatchJobOutcome) {
  "success" {
    $workflowRunUrlPattern = '^' +
      [Regex]::Escape("$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/actions/runs/") +
      '[1-9]\d*$'
    if ($PrepareReleaseRunUrl -match $workflowRunUrlPattern) {
      "✅ [Dispatched prepare release workflow]($PrepareReleaseRunUrl)"
    }
    else {
      "✅ Dispatched"
    }
  }
  "failure" { "❌ Dispatch failed" }
  "cancelled" { "🚫 Dispatch cancelled" }
  default {
    if ($IdentificationJobOutcome -eq "success" -and [string]::IsNullOrWhiteSpace($PackageName)) {
      "⏭️ No release required"
    }
    else {
      "⏭️ Not dispatched"
    }
  }
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 🤖 Dependabot release preparation")
$summary.Add("")
$summary.Add("| Release | Value |")
$summary.Add("| --- | --- |")
$summary.Add("| Package | $packageDisplay |")
$summary.Add("| Dependabot PR | $pullRequestDisplay |")
$summary.Add("| Merge commit | $commitDisplay |")
$summary.Add("")
$summary.Add("## 🚀 Preparation result")
$summary.Add("")
$summary.Add("- **Package identification:** $identificationResult")
$summary.Add("- **Prepare release workflow:** $dispatchResult")

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
