# 운영 감사용 rg — archive 스냅샷 제외
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$patterns = @(
    "localhost",
    "127\.0\.0\.1",
    "STORAGE_ROOT",
    "Windows Startup",
    "ailab-start-postgres\.cmd"
)

Write-Host "=== Repo root: $root (excluding archive/**) ===" -ForegroundColor Cyan

foreach ($pat in $patterns) {
    Write-Host "`n--- rg: $pat ---" -ForegroundColor Yellow
    rg $pat `
        --glob "*.py" `
        --glob "*.ts" `
        --glob "*.tsx" `
        --glob "*.js" `
        --glob "*.jsx" `
        --glob "*.mjs" `
        --glob "*.md" `
        --glob "*.yml" `
        --glob "*.yaml" `
        --glob "!archive/**"
}
