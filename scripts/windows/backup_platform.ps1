$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\..\.."
$backend = Join-Path $root "backend"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outDir = Join-Path $backend "backups\$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$files = @("data\app.db", "job_registry.json", "experiment_history.json")
foreach ($f in $files) {
  $src = Join-Path $backend $f
  if (Test-Path $src) { Copy-Item $src -Destination $outDir -Force }
}

$zip = Join-Path $outDir "artifacts.zip"
$toArchive = @(
  Join-Path $backend "data",
  Join-Path $backend "models",
  Join-Path $backend "outputs",
  Join-Path $backend "logs"
) | Where-Object { Test-Path $_ }

if ($toArchive.Count -gt 0) {
  Compress-Archive -Path $toArchive -DestinationPath $zip -Force
}

Write-Host "Backup created: $outDir"
