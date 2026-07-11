@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js and add it to PATH.
    pause
    exit /b 1
)

echo ============================================
echo   Work Calendar - DEV MODE (Vite HMR)
echo   Source changes apply live, no manual build.
echo ============================================

echo Killing any stale dev server still holding port 5173...
node "%~dp0scripts\kill-dev.cjs"

echo.
echo Starting Vite dev server + Electron (first launch ~10s)...
echo Tip: edit files under src/ for hot-reload. Press Ctrl+C to exit.
echo.

call npm run dev
