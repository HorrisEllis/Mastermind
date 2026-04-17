@echo off
title MASTERMIND — Dev Launch
color 0B

echo.
echo  ═══════════════════════════════════════════
echo   MASTERMIND v3.0.5 — DEV LAUNCHER
echo  ═══════════════════════════════════════════
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js not found.
    echo  Download from: https://nodejs.org  ^(LTS version^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js: %NODE_VER%

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo.
    echo  Installing dependencies ^(first run only^)...
    echo  This downloads Electron ~120MB. Please wait.
    echo.
    call npm install --prefer-offline 2>&1
    if errorlevel 1 (
        color 0C
        echo.
        echo  [ERROR] npm install failed. Check internet connection.
        pause
        exit /b 1
    )
)

:: Find electron binary
set ELECTRON=node_modules\.bin\electron.cmd
if not exist "%ELECTRON%" (
    set ELECTRON=node_modules\electron\dist\electron.exe
)
if not exist "%ELECTRON%" (
    color 0C
    echo  [ERROR] Electron not found after install.
    echo  Try: npm install electron --save-dev
    pause
    exit /b 1
)

echo.
echo  Launching MASTERMIND...
echo.

:: Launch with --dev flag for DevTools
"%ELECTRON%" . --dev

exit /b 0
