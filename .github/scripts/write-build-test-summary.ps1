param(
  [Parameter(Mandatory)]
  [string] $ProjectDirectory,
  [string] $CacheHit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
$summary.Add("# 📦 $($package.name) build and test")
$summary.Add("")
$summary.Add("| Environment | Value |")
$summary.Add("| --- | --- |")
$summary.Add("| Package | $($package.name)@$($package.version) |")
$summary.Add("| Node.js | $nodeVersion |")
$summary.Add("| npm | $npmVersion |")
$summary.Add("| npm cache | $cacheResult |")
$summary.Add("")
$summary.Add("## 🧪 Tests")
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
  $summary.Add("✅ **Passed:** $passedCount")
  $summary.Add("❌ **Failed:** $($failureCount + $errorCount)")
  $summary.Add("⏭️ **Skipped:** $skippedCount")
} else {
  $summary.Add("No JUnit test report was produced.")
}

$coverageReportPath = Join-Path $ProjectDirectory "test-reporters/code-coverage/coverage-summary.json"
if (Test-Path $coverageReportPath) {
  $coverageReport = Get-Content $coverageReportPath -Raw | ConvertFrom-Json
  $coverage = $coverageReport.total
  $summary.Add("")
  $summary.Add("## 📊 Coverage")
  $summary.Add("")
  $summary.Add("**Statements:** $($coverage.statements.pct)% ($($coverage.statements.covered)/$($coverage.statements.total))")
  $summary.Add("**Branches:** $($coverage.branches.pct)% ($($coverage.branches.covered)/$($coverage.branches.total))")
  $summary.Add("**Functions:** $($coverage.functions.pct)% ($($coverage.functions.covered)/$($coverage.functions.total))")
  $summary.Add("**Lines:** $($coverage.lines.pct)% ($($coverage.lines.covered)/$($coverage.lines.total))")
}

$summary | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
