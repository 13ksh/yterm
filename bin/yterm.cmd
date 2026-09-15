@echo off
setlocal EnableExtensions
REM Windows CMD UTF-8 + ASCII YouTube
chcp 65001 >nul
set "YTERM_ROOT=%~dp0.."
if exist "%~dp0yterm.js" (
  node "%~dp0yterm.js" %*
  exit /b %ERRORLEVEL%
)
node "%YTERM_ROOT%\bin\yterm.js" %*
exit /b %ERRORLEVEL%
