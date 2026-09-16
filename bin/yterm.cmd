@echo off
setlocal EnableExtensions
chcp 65001 >nul
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1
set "YTERM_ROOT=%~dp0.."
if exist "%~dp0yterm.js" (
  node "%~dp0yterm.js" %*
  exit /b %ERRORLEVEL%
)
node "%YTERM_ROOT%\bin\yterm.js" %*
exit /b %ERRORLEVEL%
