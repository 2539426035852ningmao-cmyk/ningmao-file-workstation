@echo off
setlocal
if "%~1"=="" (
  echo Drag your Ningmao .sqlite3 backup file onto Recover-Ningmao.cmd.
  pause
  exit /b 1
)
set "NINGMAO_DATA_DIR=%~dp0data"
set "WEBVIEW2_USER_DATA_FOLDER=%~dp0webview"
set "NINGMAO_RECYCLE_TEST_ROOT="
start "" /D "%~dp0app" "%~dp0app\Ningmao-Preview-0.1.0-x64.exe" --restore-backup "%~1"
endlocal
