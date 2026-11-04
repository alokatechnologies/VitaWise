@echo off
rem ==============================================================================
rem VitaWise One-Click Windows Launcher
rem ==============================================================================
setlocal
cd /d "%~dp0"

echo ============================================================
echo           Launching VitaWise (Health Intelligence)
echo ============================================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH.
    echo Please install Node.js from https://nodejs.org to run VitaWise locally.
    echo.
    pause
    exit /b 1
)

node start-vitawise.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to launch VitaWise.
    echo Please check the error message above.
    pause
    exit /b 1
)

echo.
echo [VitaWise] Application launched successfully.
timeout /t 3 >nul
exit /b 0
