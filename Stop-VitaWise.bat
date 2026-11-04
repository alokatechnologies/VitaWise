@echo off
rem ==============================================================================
rem VitaWise Safe Backend Shutdown Script
rem Stops only the VitaWise background process on port 3001
rem ==============================================================================
setlocal
cd /d "%~dp0"

echo ============================================================
echo          Stopping VitaWise Background Server
echo ============================================================
echo.

node stop-vitawise.mjs

echo.
timeout /t 3 >nul
exit /b 0
