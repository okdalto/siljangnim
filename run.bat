@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
:: Remove trailing backslash
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

:: ── Kill stale processes on our ports ──────────────────────────
call :free_port 8000
call :free_port 5173

:: ── Backend setup ──────────────────────────────────────────────
if not exist "%ROOT%\backend\.venv" (
    echo [1/4] Creating Python virtual environment...
    python -m venv "%ROOT%\backend\.venv"
) else (
    echo [1/4] Python virtual environment already exists.
)
call "%ROOT%\backend\.venv\Scripts\activate.bat"
echo [2/4] Installing Python dependencies (pip)...
pip install -q -r "%ROOT%\backend\requirements.txt"
echo      Done.

:: ── Frontend setup ─────────────────────────────────────────────
if not exist "%ROOT%\frontend\node_modules" (
    echo [3/4] Installing frontend dependencies (npm install)...
    pushd "%ROOT%\frontend"
    call npm install
    popd
    echo      Done.
) else (
    echo [3/4] Frontend dependencies already installed.
)

:: ── Start servers ──────────────────────────────────────────────
echo [4/4] Starting servers...
echo.
echo    Backend   → http://localhost:8000
echo    Frontend  → http://localhost:5173
echo    Rendering → WebGL2 in browser
echo.
echo Press Ctrl+C to stop.
echo.

:: Start backend (in a new window so both are visible)
set "CLAUDECODE="
start "siljangnim-backend" cmd /c "cd /d "%ROOT%\backend" && "%ROOT%\backend\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Start frontend in current window (keeps the script alive)
pushd "%ROOT%\frontend"
call npm run dev -- --host 0.0.0.0 --port 5173
popd

goto :eof

:: ── Helper: kill process using a given port ────────────────────
:free_port
set "PORT=%~1"
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING" 2^>nul') do (
    if not "%%p"=="0" (
        echo Port %PORT% in use — killing PID: %%p
        taskkill /F /PID %%p >nul 2>&1
    )
)
goto :eof
