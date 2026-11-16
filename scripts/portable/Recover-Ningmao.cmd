@echo off
setlocal
if "%~1"=="" (
  echo Drag your Ningmao .sqlite3 backup file onto Recover-Ningmao.cmd.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Workspace.ps1" -Action Restore -BackupPath "%~1"
endlocal
