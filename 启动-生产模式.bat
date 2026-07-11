@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js and add it to PATH.
    pause
    exit /b 1
)

echo ============================================
echo   Work Calendar - PRODUCTION MODE
echo ============================================

REM Check if rebuild is needed: compare newest src file mtime vs dist/index.html
set NEED_BUILD=0
if not exist "dist\index.html" (
    set NEED_BUILD=1
) else (
    powershell -NoProfile -Command "$src=(Get-ChildItem src -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1); if($src -and $src.LastWriteTime -gt (Get-Item dist\index.html).LastWriteTime){exit 1}else{exit 0}"
    if errorlevel 1 set NEED_BUILD=1
)

if %NEED_BUILD%==1 (
    echo [1/2] Source updated, rebuilding (about 10s)...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed. Check source or run "npm run build" for details.
        pause
        exit /b 1
    )
) else (
    echo [1/2] dist is up to date, skipping build.
)

echo [2/2] Launching Electron app...
start "" npm start

echo Done. The app started in the system tray; click the tray icon or double-click to open.
timeout /t 3 >nul
