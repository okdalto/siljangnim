@echo off
rem Run Siljangnim from source: installs dependencies on first run, then starts
rem the desktop app in dev mode. Only Node.js 22+ is required - Python is
rem downloaded and managed by the app itself.
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22+ is required: https://nodejs.org
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22+ is required.
  pause
  exit /b 1
)

if not exist desktop\node_modules goto install
if not exist studio\node_modules goto install
goto run
:install
call npm install || exit /b 1
:run
call npm run dev
