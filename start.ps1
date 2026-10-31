# Starts the database, website and API. Run from the project folder: .\start.ps1
$data = "$env:LOCALAPPDATA\BhanuShreeERP\mysql"
if ((Test-Path "$data\my.ini") -and -not (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" -ArgumentList "--defaults-file=`"$data\my.ini`"" -WindowStyle Hidden
  Start-Sleep 6
}
Set-Location "$PSScriptRoot\backend"
& .venv\Scripts\python.exe server.py
