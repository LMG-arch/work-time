@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   上班日历 · 一键启动（生产模式）
echo ============================================

REM 检查 node 是否在 PATH 中
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 并将其加入 PATH。
    pause
    exit /b 1
)

REM 判断是否需要重新构建：比较 src 下最新文件与 dist/index.html 的修改时间
set NEED_BUILD=0
if not exist "dist\index.html" (
    set NEED_BUILD=1
) else (
    powershell -NoProfile -Command "$src=(Get-ChildItem src -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1); if($src -and $src.LastWriteTime -gt (Get-Item dist\index.html).LastWriteTime){exit 1}else{exit 0}"
    if errorlevel 1 set NEED_BUILD=1
)

if %NEED_BUILD%==1 (
    echo [1/2] 检测到源码有更新，正在重新构建（约 10 秒）...
    call npm run build
    if errorlevel 1 (
        echo [错误] 构建失败，请检查源码或运行 npm run build 查看详细错误。
        pause
        exit /b 1
    )
) else (
    echo [1/2] dist 已是最新，跳过构建。
)

echo [2/2] 启动 Electron 应用...
start "" npm start

echo 完成！应用已在系统托盘启动，点击托盘图标或双击打开。
timeout /t 3 >nul
