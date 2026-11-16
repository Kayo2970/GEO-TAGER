@echo off
setlocal
cd /d "%~dp0"
echo ====================================
echo     Starting GEO-TAGER...
echo ====================================

REM Prefer virtual environment if available
if exist ".venv\Scripts\python.exe" (
    set "PY_CMD=.venv\Scripts\python.exe"
) else if exist "code\.venv\Scripts\python.exe" (
    set "PY_CMD=code\.venv\Scripts\python.exe"
) else (
    set "PY_CMD=python"
)

REM Start Flask app in background
start "" %PY_CMD% code\app.py

REM Wait 2 seconds for server to initialize
timeout /t 2 /nobreak >nul 2>&1 || ping -n 3 127.0.0.1 >nul

REM Open in default web browser
start "" "http://127.0.0.1:5000"

echo Server started at http://127.0.0.1:5000
exit
