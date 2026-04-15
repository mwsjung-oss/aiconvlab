param(
  [string]$PgVersion = "17.9-2",
  [string]$PgSuperUser = "postgres",
  [string]$PgPassword = "postgres",
  [int]$PgPort = 5432,
  [string]$PgDatabase = "ailab",
  [switch]$SkipPipInstall
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$root = Resolve-Path "$PSScriptRoot\..\.."
$backend = Join-Path $root "backend"
$pgHome = "C:\pg17"
$pgData = "C:\pgdata17"
$pgBin = Join-Path $pgHome "pgsql\bin"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$psql = Join-Path $pgBin "psql.exe"
$createdb = Join-Path $pgBin "createdb.exe"
$initdb = Join-Path $pgBin "initdb.exe"
$logFile = Join-Path $pgHome "server.log"
$zipPath = Join-Path $pgHome "postgres.zip"
$downloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip"

Write-Step "Check workspace"
Set-Location $root

if (!(Test-Path $pgBin)) {
  Write-Step "Download and extract portable PostgreSQL"
  New-Item -ItemType Directory -Force -Path $pgHome | Out-Null
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $pgHome -Force
}

$env:PATH = "$pgBin;$env:PATH"

if (!(Test-Path (Join-Path $pgData "PG_VERSION"))) {
  Write-Step "Initialize PostgreSQL cluster (UTF-8)"
  if (Test-Path $pgData) { Remove-Item $pgData -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $pgData | Out-Null
  $pwFile = Join-Path $pgHome "pw.txt"
  Set-Content -Path $pwFile -Value $PgPassword -NoNewline
  & $initdb -D $pgData -U $PgSuperUser -A scram-sha-256 --pwfile="$pwFile" --no-locale -E UTF8
  Remove-Item $pwFile -Force
}

Write-Step "Start PostgreSQL"
& $pgCtl -D $pgData -l $logFile start | Out-Null

$env:PGPASSWORD = $PgPassword

Write-Step "Ensure target database exists"
$dbExists = (& $psql -h 127.0.0.1 -p $PgPort -U $PgSuperUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PgDatabase'").Trim()
if ($dbExists -ne "1") {
  & $createdb -h 127.0.0.1 -p $PgPort -U $PgSuperUser $PgDatabase
}

Write-Step "Prepare Python and PostgreSQL driver"
Set-Location $backend
$venvPy = ".\.venv\Scripts\python.exe"
if (Test-Path $venvPy) {
  $py = $venvPy
}
else {
  $py = "python"
}
if (!$SkipPipInstall) {
  & $py -m pip install "psycopg[binary]"
}

$pgUrl = "postgresql+psycopg://" + $PgSuperUser + ":" + $PgPassword + "@127.0.0.1:" + $PgPort + "/" + $PgDatabase

Write-Step "Run SQLite -> PostgreSQL migration with verification"
& $py ".\migrate_sqlite_to_postgres.py" --pg-url $pgUrl --truncate-target

Write-Step "Cut over backend to PostgreSQL (.env)"
$envPath = Join-Path $backend ".env"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, "DATABASE_URL=$pgUrl", $utf8NoBom)

Write-Step "Validate backend DB connection"
& $py -c "from database import engine, IS_SQLITE; from sqlalchemy import text; c=engine.connect(); print('url=',engine.url); print('is_sqlite=',IS_SQLITE); print('users=', c.execute(text('select count(*) from users')).scalar_one()); c.close()"

Write-Step "Done"
Write-Host "PostgreSQL migration and cutover completed." -ForegroundColor Green
