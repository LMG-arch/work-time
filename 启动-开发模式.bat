@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   上班日历 · 开发模式（Vite HMR）
echo   源码改动实时生效，无需手动构建
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 并将其加入 PATH。
    pause
    exit /b 1
)

echo 正在启动 Vite 开发服务器 + Electron（首次约 10 秒）...
echo 提示：修改 src/ 下任意文件，界面会自动热更新。Ctrl+C 退出。
echo.
call npm run dev
