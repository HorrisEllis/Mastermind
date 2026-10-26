@echo off
title MASTERMIND — Build Installer
color 0B

echo.
echo  ═══════════════════════════════════════════
echo   MASTERMIND — BUILD INSTALLER
echo  ═══════════════════════════════════════════
echo.
echo  This builds a Windows .exe installer.
echo  First run downloads Electron (~120MB).
echo  Build time: 2-5 minutes.
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js not found.
    echo  Download from: https://nodejs.org  ^(LTS, v18 or newer^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js: %NODE_VER%
echo.

:: Fetch the Whisper model (~142MB) if it isn't already here. The
:: whisper-cli.exe binary and its DLLs are small and committed to the
:: repo directly; only the model itself is fetched, once, right here —
:: on this machine, which has normal internet access — rather than
:: bundled into the repo or downloaded by whoever installs the app.
if not exist "resources\whisper\models\ggml-base.bin" (
    echo  [Whisper] Fetching local speech-to-text model ^(~142MB, one-time^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' -OutFile 'resources\whisper\models\ggml-base.bin' -UseBasicParsing } catch { exit 1 }"
    if errorlevel 1 (
        color 0C
        echo  [WARNING] Could not download the Whisper model — voice capture will
        echo  report itself unavailable until this file exists. Not fatal to the
        echo  build; retry later, or fetch it by hand into
        echo  resources\whisper\models\ggml-base.bin from:
        echo    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
        color 0B
        echo.
    ) else (
        echo  [Whisper] Model downloaded.
        echo.
    )
) else (
    echo  [Whisper] Model already present — skipping download.
    echo.
)

:: Fetch cloudflared.exe (~52MB) if it isn't already here — the phone
:: input feature's Cloudflare Tunnel mode needs it. LAN mode (the
:: default, self-signed TLS, audio never leaves the network) does NOT
:: need this at all and works without it. Only fetched, never bundled
:: into the repo, for the same reason as the whisper model: keep the
:: repo small, download once on the machine that has real bandwidth.
if not exist "resources\cloudflared\cloudflared.exe" (
    echo  [Phone Input] Fetching cloudflared ^(~52MB, one-time, optional^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'resources\cloudflared\cloudflared.exe' -UseBasicParsing } catch { exit 1 }"
    if errorlevel 1 (
        color 0C
        echo  [WARNING] Could not download cloudflared — LAN mode phone input still
        echo  works fully; only the Cloudflare Tunnel option will report itself
        echo  unavailable until this file exists. Not fatal to the build; retry
        echo  later, or fetch it by hand into resources\cloudflared\cloudflared.exe
        echo  from:
        echo    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
        color 0B
        echo.
    ) else (
        echo  [Phone Input] cloudflared downloaded.
        echo.
    )
) else (
    echo  [Phone Input] cloudflared already present — skipping download.
    echo.
)

:: Read the version from package.json — the ONE place it's defined —
:: instead of hardcoding it here too. A hardcoded copy is exactly how
:: this script used to go looking for a filename that didn't match the
:: version electron-builder actually produced.
for /f "tokens=*" %%v in ('node -pe "require(\"./package.json\").version"') do set APP_VER=%%v

:: Install dependencies
echo  [1/3] Installing dependencies...
call npm install 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] npm install failed.
    echo  Check: internet connection, Node.js version ^(needs v18+^)
    pause
    exit /b 1
)
echo  Dependencies OK.
echo.

:: Build installer
echo  [2/3] Building installer ^(v%APP_VER%^)...
echo  ^(This may take a few minutes^)
echo.
call npm run build 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] Build failed. Common fixes:
    echo    - Run as Administrator if permission errors occur
    echo    - Check dist\ folder is not open in Explorer
    echo    - Antivirus may block Electron packaging
    pause
    exit /b 1
)

:: Find output
echo.
echo  [3/3] Build complete!
echo.
if exist "dist\MASTERMIND-Setup-%APP_VER%.exe" (
    echo  Installer: dist\MASTERMIND-Setup-%APP_VER%.exe
    echo.
    set /p OPEN="Open dist folder? (y/n): "
    if /i "%OPEN%"=="y" explorer dist\
) else (
    echo  Check dist\ folder for the installer.
)

echo.
echo  Done.
pause
exit /b 0
