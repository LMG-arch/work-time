@echo off
cd /d "%~dp0"
echo 正在构建...
call npm run build
if %errorlevel% neq 0 (
    echo 构建失败，按任意键退出
    pause >nul
    exit /b %errorlevel%
)
echo 构建成功，启动应用...
npx electron .
