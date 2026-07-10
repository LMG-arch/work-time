' 上班日历 · 一键启动（生产模式，静默无黑窗口）
' 自动检测源码更新并重建，然后启动 Electron。
' 适合放在桌面双击使用。

Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "启动-生产模式.bat")

' 0 = 隐藏窗口运行，避免弹出黑色控制台
ws.Run Chr(34) & batPath & Chr(34), 0, False
