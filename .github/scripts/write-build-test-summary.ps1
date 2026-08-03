param(
  [Parameter(Mandatory)]
  [string] $ProjectDirectory,
  [string] $CacheHit,
  [string] $InstallOutcome,
  [string] $BuildOutcome,
  [string] $TestOutcome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Format-Outcome {
  param([string] $Outcome)

  switch ($Outcome) {
    "success" { return "✅ Passed" }
    "failure" { return "❌ Failed" }
    "cancelled" { return "🛑 Cancelled" }
    "skipped" { return "⏭️ Skipped" }
    default { return "➖ Not run" }
  }
}

function Format-Percentage {
  param([double] $Rate)

  return ($Rate * 100).ToString("0.##", [Globalization.CultureInfo]::InvariantCulture) + "%"
}

$packageJsonPath = Join-Path $ProjectDirectory "package.json"
$package = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$nodeVersion = if (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { "Unavailable" }
$npmVersion = if (Get-Command npm -ErrorAction SilentlyContinue) { npm --version } else { "Unavailable" }
$cacheResult = switch ($CacheHit) {
  "true" { "Hit" }
  "false" { "Miss" }
  default { "Unavailable" }
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("# 🧪 $($package.name) build and test")
$summary.Add("")
$summary.Add("| Environment | Value |")
$summary.Add("| --- | --- |")
$summary.Add("| Package | $($package.name)@$($package.version) |")
$summary.Add("| Node.js | $nodeVersion |")
$summary.Add("| npm | $npmVersion |")
$summary.Add("| npm cache | $cacheResult |")
$summary.Add("")
$summary.Add("## Steps")
$summary.Add("")
$summary.Add("| Step | Result |")
$summary.Add("| --- | --- |")
$summary.Add("| Install dependencies | $(Format-Outcome $InstallOutcome) |")
$summary.Add("| Build | $(Format-Outcome $BuildOutcome) |")
$summary.Add("| Test | $(Format-Outcome $TestOutcome) |")
$summary.Add("")
$summary.Add("## Tests")
$summary.Add("")

$testReportPath = Join-Path $ProjectDirectory "test-reporters/junit-report/vitest-test-results.xml"
if (Test-Path $testReportPath) {
  [xml] $testReport = Get-Content $testReportPath -Raw
  $testSuites = @($testReport.testsuites.testsuite)
  $testCount = [int] $testReport.testsuites.tests
  $failureCount = [int] $testReport.testsuites.failures
  $errorCount = [int] $testReport.testsuites.errors
  $skippedCount = [int] (($testSuites | Measure-Object -Property skipped -Sum).Sum)
  $passedCount = $testCount - $failureCount - $errorCount - $skippedCount
  $duration = ([double] $testReport.testsuites.time).ToString("0.###", [Globalization.CultureInfo]::InvariantCulture) + "s"
  $summary.Add("| Test files | Tests | Passed | Failed | Skipped | Test time |")
  $summary.Add("| ---: | ---: | ---: | ---: | ---: | ---: |")
  $summary.Add("| $($testSuites.Count) | $testCount | $passedCount | $($failureCount + $errorCount) | $skippedCount | $duration |")
  $failedTests = @($testReport.SelectNodes("//testcase[failure or error]"))
  if ($failedTests.Count -gt 0) {
    $summary.Add("")
    $summary.Add("### ❌ Failed tests")
    $summary.Add("")
    foreach ($failedTest in $failedTests) {
      $summary.Add("- $($failedTest.classname) - $($failedTest.name)")
    }
  }
} else {
  $summary.Add("No JUnit test report was produced.")
}

$coverageReportPath = Join-Path $ProjectDirectory "test-reporters/code-coverage/cobertura-report.xml"
if (Test-Path $coverageReportPath) {
  [xml] $coverageReport = Get-Content $coverageReportPath -Raw
  $coverage = $coverageReport.DocumentElement
  $summary.Add("")
  $summary.Add("## Coverage")
  $summary.Add("")
  $summary.Add("| Metric | Covered | Total | Percentage |")
  $summary.Add("| --- | ---: | ---: | ---: |")
  $summary.Add("| Lines | $($coverage.GetAttribute("lines-covered")) | $($coverage.GetAttribute("lines-valid")) | $(Format-Percentage ([double] $coverage.GetAttribute("line-rate"))) |")
  $summary.Add("| Branches | $($coverage.GetAttribute("branches-covered")) | $($coverage.GetAttribute("branches-valid")) | $(Format-Percentage ([double] $coverage.GetAttribute("branch-rate"))) |")
}

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
