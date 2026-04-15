param(
  [string]$PgData = "C:\pgdata17",
  [string]$PgHome = "C:\pg17"
)

$ErrorActionPreference = "Stop"

$pgCtl = Join-Path $PgHome "pgsql\bin\pg_ctl.exe"
if (!(Test-Path $pgCtl)) {
  throw "pg_ctl.exe 를 찾을 수 없습니다: $pgCtl"
}
if (!(Test-Path (Join-Path $PgData "PG_VERSION"))) {
  throw "PostgreSQL data 디렉토리를 찾을 수 없습니다: $PgData"
}

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "ailab-start-postgres.cmd"
$content = "@echo off`r`n`"$pgCtl`" -D `"$PgData`" -l `"$PgHome\server.log`" start`r`n"
Set-Content -Path $launcherPath -Value $content -Encoding ASCII

Write-Host "등록 완료: $launcherPath"
Write-Host "다음 로그인부터 PostgreSQL이 자동 기동됩니다."
