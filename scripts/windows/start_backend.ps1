$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\..\.."
$backend = Join-Path $root "backend"
Set-Location $backend

if (Test-Path ".\.venv\Scripts\Activate.ps1") {
  . .\.venv\Scripts\Activate.ps1
}

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
