package com.workcalendar.app;

import android.app.Application;
import android.os.Build;
import android.util.Log;
import android.webkit.WebView;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 进程级崩溃捕获：
 * 把未捕获异常（含原生 NPE / 插件异常 / WebView 相关）写进
 * getExternalFilesDir(null)/crashlogs/crash-<ts>.txt，
 * 下次启动由 web 层读取并弹出可分享的崩溃信息。
 * 仍链式调用系统默认 handler，保留「应用已停止」对话框与进程退出。
 */
public class MainApplication extends Application {
    private static final String TAG = "WCCrash";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler sysHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable ex) {
                writeCrash(thread, ex);
                if (sysHandler != null) {
                    sysHandler.uncaughtException(thread, ex);
                } else {
                    System.exit(1);
                }
            }
        });
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
