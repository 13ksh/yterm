@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title yterm 설치

REM GitHub + curl 로 CMD 에서 바로 설치
REM   curl -L -o %TEMP%\yterm-install.cmd https://raw.githubusercontent.com/계정/저장소/main/install.cmd
REM   %TEMP%\yterm-install.cmd 계정/저장소

set "REPO=%~1"
if "%REPO%"=="" set "REPO=%YTERM_GITHUB%"

if /I "%REPO%"=="--local" goto LOCAL
if "%REPO%"=="" (
  echo.
  echo  GitHub 저장소가 필요합니다.
  echo    install.cmd 내계정/저장소
  echo.
  echo  GitHub 에서 Create repo 한 뒤, 그 주소의 계정/이름을 넣으세요.
  echo  이미 이 폴더를 받았다면:
  echo    install.cmd --local
  echo.
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo git 이 없습니다. https://git-scm.com/download/win
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ 가 필요합니다. https://nodejs.org
  exit /b 1
)

set "DEST=%LOCALAPPDATA%\yterm"
set "URL=%REPO%"
echo %URL% | findstr /I "https://" >nul
if errorlevel 1 set "URL=https://github.com/%REPO%.git"

echo [1/4] 저장소 받는 중  %URL%
if exist "%DEST%\.git" (
  git -C "%DEST%" pull --ff-only
) else (
  if exist "%DEST%" rmdir /s /q "%DEST%"
  git clone --depth 1 "%URL%" "%DEST%"
)
goto INSTALL

:LOCAL
set "DEST=%cd%"
echo [1/4] 이 폴더에 설치  %DEST%

:INSTALL
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ 가 필요합니다. https://nodejs.org
  exit /b 1
)

echo [2/4] npm install
pushd "%DEST%"
call npm install
if errorlevel 1 (
  popd
  echo npm install 실패
  exit /b 1
)
popd

echo [3/4] CMD 실행 파일
set "SHIM=%USERPROFILE%\yterm.cmd"
> "%SHIM%" (
  echo @echo off
  echo chcp 65001 ^>nul
  echo node "%DEST%\bin\yterm.js" %%*
)
set "APPS=%LOCALAPPDATA%\Microsoft\WindowsApps\yterm.cmd"
copy /Y "%SHIM%" "%APPS%" >nul 2>&1

echo [4/4] ffmpeg / yt-dlp
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo ffmpeg 가 PATH 에 없습니다. 재생에 필요합니다.
  echo   winget install Gyan.FFmpeg
  echo   또는 https://ffmpeg.org/download.html
)
where yt-dlp >nul 2>&1
if errorlevel 1 (
  where pip >nul 2>&1
  if not errorlevel 1 pip install -q yt-dlp
)

echo.
echo  설치됨. 새 CMD 창에서:
echo    yterm
echo    yterm --demo
echo.
echo  yterm 을 못 찾으면:
echo    "%SHIM%"
echo  또는 사용자 폴더를 PATH 에 추가하세요.
echo.
exit /b 0
