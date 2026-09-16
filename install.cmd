@echo off
setlocal EnableExtensions
title yterm install

REM ASCII-only: CMD misreads UTF-8 Korean and breaks REM/echo.

if /I "%~1"=="--local" goto LOCAL

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required: https://nodejs.org
  exit /b 1
)

set "DEST=%LOCALAPPDATA%\yterm"
set "ZIP=%TEMP%\yterm-src.zip"
set "STAGE=%TEMP%\yterm-src"
set "URL=https://github.com/13ksh/yterm/archive/refs/heads/main.zip"

echo [1/4] Download %URL%
curl -L --fail -o "%ZIP%" "%URL%"
if errorlevel 1 (
  echo Download failed. Install git and run: git clone https://github.com/13ksh/yterm.git
  exit /b 1
)

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
tar -xf "%ZIP%" -C "%STAGE%" 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Expand-Archive -Force -Path '%ZIP%' -DestinationPath '%STAGE%'"
  if errorlevel 1 (
    echo Unpack failed.
    exit /b 1
  )
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
if errorlevel 1 (
  echo Copy failed.
  exit /b 1
)
goto INSTALL

:LOCAL
set "DEST=%CD%"
echo [1/4] Using this folder %DEST%

:INSTALL
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required: https://nodejs.org
  exit /b 1
)

echo [2/4] npm install
pushd "%DEST%"
call npm install
if errorlevel 1 (
  popd
  echo npm install failed.
  exit /b 1
)
popd

echo [3/4] CMD launcher
set "SHIM=%DEST%\yterm.cmd"
echo @echo off> "%SHIM%"
echo chcp 65001 ^>nul>> "%SHIM%"
echo node "%DEST%\bin\yterm.js" %%*>> "%SHIM%"

copy /Y "%SHIM%" "%USERPROFILE%\yterm.cmd" >nul
copy /Y "%SHIM%" "%LOCALAPPDATA%\Microsoft\WindowsApps\yterm.cmd" >nul 2>&1

echo [4/4] ffmpeg / yt-dlp
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo ffmpeg not in PATH. Needed for playback:
  echo   winget install Gyan.FFmpeg
)
where yt-dlp >nul 2>&1
if errorlevel 1 (
  where pip >nul 2>&1
  if not errorlevel 1 pip install -q yt-dlp
)

echo.
echo Installed.
echo   yterm
echo Do not use --demo unless you want fake videos.
echo.
echo If 'yterm' is not found, open a NEW CMD window or run:
echo   "%SHIM%"
echo.
exit /b 0
