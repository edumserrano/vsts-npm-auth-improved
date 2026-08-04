param(
  [Parameter(Mandatory)]
  [string] $PackageName,
  [string] $Version,
  [string] $DistTag,
  [string] $SourceCommit,
  [string] $CacheHit,
  [string] $PublishOutcome,
  [string] $CreateTagOutcome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$unavailable = "Unavailable"
$versionDisplay = if ([string]::IsNullOrWhiteSpace($Version)) { $unavailable } else { $Version }
$distTagDisplay = if ([string]::IsNullOrWhiteSpace($DistTag)) { $unavailable } else { $DistTag }
$cacheResult = switch ($CacheHit) {
  "true" { "Hit" }
  "false" { "Miss" }
  default { $unavailable }
}
$nodeVersion = if (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { $unavailable }
$npmVersion = if (Get-Command npm -ErrorAction SilentlyContinue) { npm --version } else { $unavailable }

$sourceCommitDisplay = $unavailable
if (-not [string]::IsNullOrWhiteSpace($SourceCommit)) {
  $shortSourceCommit = $SourceCommit.Substring(0, [Math]::Min(7, $SourceCommit.Length))
  $sourceCommitUrl = "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/commit/$SourceCommit"
  $sourceCommitDisplay = "[$shortSourceCommit]($sourceCommitUrl)"
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 📤 $PackageName publish")
$summary.Add("")
$summary.Add("| Release | Value |")
$summary.Add("| --- | --- |")
$summary.Add(('| Package | `{0}@{1}` |' -f $PackageName, $versionDisplay))
$summary.Add('| npm dist-tag | `{0}` |' -f $distTagDisplay)
$summary.Add("| Source commit | $sourceCommitDisplay |")
$summary.Add("| Node.js | $nodeVersion |")
$summary.Add("| npm | $npmVersion |")
$summary.Add("| npm cache | $cacheResult |")
$summary.Add("")
$summary.Add("## ✅ Release result")
$summary.Add("")

$npmResult = switch ($PublishOutcome) {
  "success" { "✅ Published" }
  "failure" { "❌ Publish failed" }
  "cancelled" { "🚫 Publish cancelled" }
  default { "⏭️ Not published" }
}
$summary.Add("- **npm:** $npmResult")

$tagResult = switch ($CreateTagOutcome) {
  "success" { "✅ Tag created" }
  "failure" { "❌ Tag creation failed" }
  "cancelled" { "🚫 Tag creation cancelled" }
  default { "⏭️ Not created" }
}
$summary.Add("- **Git tag:** $tagResult")

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
