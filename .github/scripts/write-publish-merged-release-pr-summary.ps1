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
  [string] $DistTag,
  [string] $NodeVersion,
  [string] $NpmVersion,
  [string] $CacheHit,
  [string] $NpmPublishOutcome,
  [string] $GitTagOutcome,
  [Parameter(Mandatory)]
  [string] $PublishJobOutcome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$unavailable = "Unavailable"
$oldVersionDisplay = if ([string]::IsNullOrWhiteSpace($OldVersion)) { $unavailable } else { $OldVersion }
$newVersionDisplay = if ([string]::IsNullOrWhiteSpace($NewVersion)) { $unavailable } else { $NewVersion }
$distTagDisplay = if ([string]::IsNullOrWhiteSpace($DistTag)) { $unavailable } else { $DistTag }
$nodeVersionDisplay = if ([string]::IsNullOrWhiteSpace($NodeVersion)) { $unavailable } else { $NodeVersion }
$npmVersionDisplay = if ([string]::IsNullOrWhiteSpace($NpmVersion)) { $unavailable } else { $NpmVersion }
$cacheResult = switch ($CacheHit) {
  "true" { "Hit" }
  "false" { "Miss" }
  default { $unavailable }
}
$commitDisplay = $unavailable
if ($SourceCommit -match '^[0-9a-f]{40}$') {
  $shortCommit = $SourceCommit.Substring(0, 7)
  $commitUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/commit/$SourceCommit"
  $commitDisplay = "[$shortCommit]($commitUrl)"
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 🚀 $PackageName release")
$summary.Add("")
$summary.Add("| Release | Value |")
$summary.Add("| --- | --- |")
$summary.Add(('| Package | `{0}@{1}` |' -f $PackageName, $newVersionDisplay))
$summary.Add("| Version | ``$oldVersionDisplay`` → ``$newVersionDisplay`` |")
$summary.Add("| npm dist-tag | ``$distTagDisplay`` |")
$summary.Add("| Preparation PR | [#$PullRequestNumber]($PullRequestUrl) |")
$summary.Add("| Merge commit | $commitDisplay |")
$summary.Add("| Node.js | $nodeVersionDisplay |")
$summary.Add("| npm | $npmVersionDisplay |")
$summary.Add("| npm cache | $cacheResult |")
$summary.Add("")
$summary.Add("## 📦 Publish result")
$summary.Add("")
$jobResult = switch ($PublishJobOutcome) {
  "success" { "✅ Succeeded" }
  "failure" { "❌ Failed" }
  "cancelled" { "🚫 Cancelled" }
  default { "⏭️ Skipped" }
}
$summary.Add("- **Publish job:** $jobResult")

$npmResult = switch ($NpmPublishOutcome) {
  "success" {
    if (
      -not [string]::IsNullOrWhiteSpace($PackageName) -and
      -not [string]::IsNullOrWhiteSpace($NewVersion)
    ) {
      $npmPackageUrl = "https://www.npmjs.com/package/$([Uri]::EscapeDataString($PackageName))/v/$([Uri]::EscapeDataString($NewVersion))"
      "✅ Published [``$PackageName@$NewVersion``]($npmPackageUrl)"
    }
    else {
      "✅ Published"
    }
  }
  "failure" { "❌ Publish failed" }
  "cancelled" { "🚫 Publish cancelled" }
  default { "⏭️ Not published" }
}
$summary.Add("- **npm:** $npmResult")

$tagResult = switch ($GitTagOutcome) {
  "success" {
    if (
      -not [string]::IsNullOrWhiteSpace($PackageName) -and
      -not [string]::IsNullOrWhiteSpace($NewVersion)
    ) {
      $releaseTag = "$PackageName@$NewVersion"
      $gitTagUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/tree/$([Uri]::EscapeDataString($releaseTag))"
      "✅ Created [``$releaseTag``]($gitTagUrl)"
    }
    else {
      "✅ Tag created"
    }
  }
  "failure" { "❌ Tag creation failed" }
  "cancelled" { "🚫 Tag creation cancelled" }
  default { "⏭️ Not created" }
}
$summary.Add("- **Git tag:** $tagResult")

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
