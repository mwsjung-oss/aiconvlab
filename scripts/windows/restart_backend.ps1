$ErrorActionPreference = "SilentlyContinue"
$proc = Get-NetTCPConnection -LocalPort 8000 | Select-Object -First 1 -ExpandProperty OwningProcess
if ($proc) { Stop-Process -Id $proc -Force }
$ErrorActionPreference = "Stop"

& "$PSScriptRoot\start_backend.ps1"
