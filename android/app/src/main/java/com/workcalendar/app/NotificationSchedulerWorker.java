package com.workcalendar.app;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * WorkManager Worker: 后台周期性任务占位。
 * 注意：Capacitor 的 Bridge 绑定 WebView 生命周期，后台进程无法直接执行 JS。
 * 实际的通知调度由 LocalNotifications 插件通过 AlarmManager 在原生层完成。
 * 此 Worker 主要用于：保持进程活跃、日志记录、未来扩展原生调度逻辑。
 */
public class NotificationSchedulerWorker extends Worker {

    private static final String TAG = "NotifSchedulerWorker";

    public NotificationSchedulerWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.i(TAG, "Background periodic task triggered (keep-alive / future native scheduling hook)");
        // 当前不执行 JS 调度（Bridge 仅在 WebView 初始化后可用）。
        // LocalNotifications 已通过 AlarmManager 在系统层面按时触发通知。
        // 如需原生层面重新计算调度，可在此添加 AlarmManager 直接操作。
        return Result.success();
    }
}