@echo off
setlocal
title Reader Workbench
pushd "%~dp0"
if errorlevel 1 exit /b 1

echo Starting Reader Workbench...
echo Keep this window open while using the app.
echo Press Ctrl+C or close this window to stop the server.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Reader.ps1" %*
set "readerExitCode=%errorlevel%"
popd

if not "%readerExitCode%"=="0" (
    echo.
    echo Reader Workbench could not start. See the error above.
    pause
)
exit /b %readerExitCode%
