@echo off
setlocal EnableExtensions
title yterm setup v2

if /I "%~1"=="--local" goto LOCAL

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required: https://nodejs.org
  exit /b 1
)

set "DEST=%LOCALAPPDATA%\yterm"
set "ZIP=%TEMP%\yterm-src.zip"
set "STAGE=%TEMP%\yterm-src"
set "URL=https://codeload.github.com/13ksh/yterm/zip/refs/heads/main"

echo [1/4] Download
curl.exe -L --fail --retry 3 -o "%ZIP%" "%URL%"
if errorlevel 1 (
  echo Download failed.
  exit /b 1
)

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
tar -xf "%ZIP%" -C "%STAGE%" 2>nul
if errorlevel 1 powershell -NoProfile -Command "Expand-Archive -Force -Path $env:TEMP\yterm-src.zip -DestinationPath $env:TEMP\yterm-src"
if errorlevel 1 (
  echo Unpack failed.
  exit /b 1
)

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
set "SRC="
for /d %%D in ("%STAGE%\*") do set "SRC=%%D"
if not defined SRC (
  echo Zip layout unexpected.
  exit /b 1
)
xcopy /E /I /Y /Q "%SRC%\*" "%DEST%\" >nul
goto INSTALL

:LOCAL
set "DEST=%CD%"
echo [1/4] Using this folder

:INSTALL
echo [2/4] npm install
pushd "%DEST%"
call npm install
if errorlevel 1 (
  popd
  echo npm install failed.
  exit /b 1
)
popd

echo [3/4] launcher
set "SHIM=%DEST%\yterm.cmd"
echo @echo off> "%SHIM%"
echo chcp 65001 ^>nul>> "%SHIM%"
echo node "%DEST%\bin\yterm.js" %%*>> "%SHIM%"
copy /Y "%SHIM%" "%USERPROFILE%\yterm.cmd" >nul
copy /Y "%SHIM%" "%LOCALAPPDATA%\Microsoft\WindowsApps\yterm.cmd" >nul 2>&1

echo [4/4] ffmpeg
where ffmpeg >nul 2>&1
if errorlevel 1 echo ffmpeg missing. Run: winget install Gyan.FFmpeg

echo.
echo OK. Close this window, open a NEW CMD, then type:
echo   yterm --demo
echo Or:
echo   "%SHIM%" --demo
echo.
exit /b 0
