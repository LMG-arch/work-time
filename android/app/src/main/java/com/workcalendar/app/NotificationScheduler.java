package com.workcalendar.app;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

/**
 * WorkManager 封装：注册/取消周期性后台通知调度任务。
 * 周期：15 分钟（最小允许周期），灵活窗口 5 分钟。
 */
public class NotificationScheduler {

    private static final String TAG = "NotifScheduler";
    private static final String WORK_NAME = "periodic-notification-scheduler";
    private static final long INTERVAL_MINUTES = 15; // 最小允许周期
    private static final long FLEX_MINUTES = 5;      // 灵活窗口：周期结束前 5 分钟内执行

    // 共享的 JS 调度代码，供 Worker 和 Plugin 复用
    public static final String SCHEDULING_JS =
        "(function() {" +
        "  try {" +
        "    if (typeof window.__WorkCalendarNotifications?.scheduleReminderNotifications === 'function') window.__WorkCalendarNotifications.scheduleReminderNotifications();" +
        "    if (typeof window.__WorkCalendarNotifications?.scheduleTodoReminders === 'function') window.__WorkCalendarNotifications.scheduleTodoReminders();" +
        "    console.log('[Worker] Notification scheduling triggered from background');" +
        "  } catch (e) { console.error('[Worker] Scheduling error:', e); }" +
        "})();";

    /**
     * 注册周期性任务
     */
    public static void registerPeriodicWork(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED) // 无网络也执行
            .setRequiresBatteryNotLow(true)
            .setRequiresCharging(false) // 不要求充电状态
            .build();

        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                NotificationSchedulerWorker.class,
                INTERVAL_MINUTES,
                java.util.concurrent.TimeUnit.MINUTES,
                FLEX_MINUTES,
                java.util.concurrent.TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .build();

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP, // 已存在则保留，不重复注册
                workRequest
            );

        Log.i(TAG, "Periodic notification scheduler registered (interval: " + INTERVAL_MINUTES + "min, flex: " + FLEX_MINUTES + "min)");
    }

    /**
     * 取消周期性任务
     */
    public static void cancelPeriodicWork(@NonNull Context context) {
        WorkManager.getInstance(context)
            .cancelUniqueWork(WORK_NAME);
        Log.i(TAG, "Periodic notification scheduler cancelled");
    }
}