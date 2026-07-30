package com.workcalendar.app;

import android.app.Application;
import android.os.Build;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 进程级入口，解决「覆盖更新/使用数日后仍闪退，必须卸载重装才行」的问题。
 *
 * 根因：vivo 等国产 ROM 会静默自动更新系统 WebView。旧 App 的 WebView 数据目录
 * (app_webview) 由升级前的 WebView 写入，新版 WebView 启动时读取该目录会原生崩溃。
 * 卸载重装 = 清空 app_webview = 恢复；覆盖更新 = 旧 app_webview 仍在 = 继续崩。
 *
 * 修复手段：
 *  1) 按系统 WebView 版本号隔离数据目录（setDataDirectorySuffix），每次 WebView
 *     升级都使用全新目录，彻底避免跨版本数据腐化。
 *  2) 崩溃自恢复：若检测到连续崩溃（崩溃环），自动清空 WebView 数据目录后重启，
 *     等价于一次「隐式卸载重装」，用户无需手动卸载。
 *  3) 首次启用隔离时清理遗留的无后缀 app_webview（旧版本产生的腐化数据）。
 *  4) 保留进程级崩溃落盘，便于仍无法复现时拿栈。
 */
public class MainApplication extends Application {
    private static final String TAG = "WCCrash";
    private static final long CRASH_LOOP_WINDOW_MS = 10L * 60 * 1000; // 10 分钟内

    @Override
    public void onCreate() {
        installCrashHandler();

        final String suffix = webViewVersionSafe();
        try {
            // 崩溃环检测：连续崩溃则清空 WebView 数据目录（隐式重装）
            maybeWipeOnCrashLoop(suffix);
            // 首次启用隔离时清理遗留的无后缀 app_webview
            cleanupLegacyWebView(suffix);
            // 必须在本进程首次创建 WebView 之前调用（早于 super 也安全）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WebView.setDataDirectorySuffix("v" + suffix);
            }
        } catch (Throwable t) {
            Log.e(TAG, "WebView isolation setup failed (ignored)", t);
        }

        super.onCreate();
    }

    // ---------- WebView 版本隔离 ----------

    private String webViewVersionSafe() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.content.pm.PackageInfo info = WebView.getCurrentWebViewPackage();
                if (info != null && info.versionName != null) {
                    return info.versionName.replaceAll("[^0-9a-zA-Z._-]", "_");
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "getCurrentWebViewPackage unavailable", t);
        }
        return "unknown";
    }

    private void cleanupLegacyWebView(String suffix) {
        // 若尚未创建隔离目录，说明是首次启用隔离；此时删除遗留的无后缀 app_webview
        File isolated = new File(getApplicationInfo().dataDir, "app_webview_v" + suffix);
        if (isolated.exists()) return;
        deleteDir(new File(getApplicationInfo().dataDir, "app_webview"));
    }

    private void maybeWipeOnCrashLoop(String suffix) {
        try {
            JSONObject state = readBootState();
            long now = System.currentTimeMillis();
            long lastCrash = state.optLong("lastCrashTs", 0);
            int crashCount = state.optInt("crashCount", 0);
            if (crashCount >= 2 && (now - lastCrash) < CRASH_LOOP_WINDOW_MS) {
                Log.i(TAG, "Crash loop detected -> wiping WebView data dirs");
                deleteDir(new File(getApplicationInfo().dataDir, "app_webview_v" + suffix));
                deleteDir(new File(getApplicationInfo().dataDir, "app_webview"));
                deleteDir(getDir("webview", MODE_PRIVATE));
                // 重置计数，避免每次启动都清
                state.put("crashCount", 0);
                state.put("lastCrashTs", 0);
                writeBootState(state);
            }
        } catch (Throwable t) {
            Log.e(TAG, "maybeWipeOnCrashLoop failed (ignored)", t);
        }
    }

    private File bootStateFile() {
        return new File(getFilesDir(), "bootstate.json");
    }

    private JSONObject readBootState() {
        File f = bootStateFile();
        if (!f.exists()) return new JSONObject();
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private void writeBootState(JSONObject state) {
        try (FileWriter w = new FileWriter(bootStateFile())) {
            w.write(state.toString());
        } catch (Exception ignored) {
        }
    }

    private void deleteDir(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] children = dir.listFiles();
        if (children != null) {
            for (File c : children) deleteDir(c);
        }
        dir.delete();
    }

    // ---------- 崩溃捕获 ----------

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler sysHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable ex) {
                writeCrash(thread, ex);
                bumpCrashCount();
                if (sysHandler != null) {
                    sysHandler.uncaughtException(thread, ex);
                } else {
                    System.exit(1);
                }
            }
        });
    }

    private void bumpCrashCount() {
        try {
            JSONObject state = readBootState();
            long now = System.currentTimeMillis();
            long lastCrash = state.optLong("lastCrashTs", 0);
            int crashCount = state.optInt("crashCount", 0);
            if ((now - lastCrash) < CRASH_LOOP_WINDOW_MS) {
                crashCount += 1;
            } else {
                crashCount = 1;
            }
            state.put("lastCrashTs", now);
            state.put("crashCount", crashCount);
            writeBootState(state);
        } catch (JSONException ignored) {
        }
    }

    private void writeCrash(Thread thread, Throwable ex) {
        try {
            File dir = new File(getExternalFilesDir(null), "crashlogs");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, "crash-" + System.currentTimeMillis() + ".txt");
            PrintWriter pw = new PrintWriter(new FileWriter(file));
            pw.println("Time: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
            pw.println("App: 上班日历 (com.workcalendar.app)");
            pw.println("Thread: " + thread.getName());
            pw.println("Model: " + Build.MANUFACTURER + " " + Build.MODEL + " (SDK " + Build.VERSION.SDK_INT + ")");
            try {
                pw.println("WebViewPkg: " + WebView.getCurrentWebViewPackage());
            } catch (Throwable t) {
                pw.println("WebViewPkg: <unavailable: " + t + ">");
            }
            pw.println("----- Stack -----");
            ex.printStackTrace(pw);
            Throwable cause = ex.getCause();
            while (cause != null) {
                pw.println("\nCaused by:");
                cause.printStackTrace(pw);
                cause = cause.getCause();
            }
            pw.flush();
            pw.close();
            Log.i(TAG, "Crash written -> " + file.getAbsolutePath());
        } catch (Throwable t) {
            Log.e(TAG, "Failed to write crash file", t);
        }
    }
}
