@echo off
title MASTERMIND — Build Installer
color 0B

echo.
echo  ═══════════════════════════════════════════
echo   MASTERMIND v3.0.5 — BUILD INSTALLER
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
echo  [2/3] Building installer...
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
if exist "dist\MASTERMIND-Setup-3.0.5.exe" (
    echo  Installer: dist\MASTERMIND-Setup-3.0.5.exe
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
