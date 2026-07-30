@echo off
REM One-click crash log grabber for 上班日历 (com.workcalendar.app)
REM Usage: connect phone via USB with USB debugging ON, then double-click this file.
SET ADB="C:\Users\21641\AppData\Local\Android\Sdk\platform-tools\adb.exe"

echo [1/3] Clearing logcat...
%ADB% logcat -c

echo [2/3] Launching app...
%ADB% shell am start -n com.workcalendar.app/.MainActivity

echo.
echo Now use the app on your phone until it crashes (force-closes).
echo After the crash, come back here and press any key to grab the log.
pause

echo [3/3] Dumping crash log...
%ADB% logcat -b crash -d > crash.txt
echo Done. Saved to crash.txt in this folder.
echo Please open crash.txt and send me the FATAL EXCEPTION / AndroidRuntime section.
notepad crash.txt
