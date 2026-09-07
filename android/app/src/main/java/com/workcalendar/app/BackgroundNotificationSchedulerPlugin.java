package com.workcalendar.app;

import android.content.Context;
import android.util.Log;
import android.webkit.ValueCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor 原生插件：暴露后台调度接口给 JS。
 */
@CapacitorPlugin(name = "BackgroundNotificationScheduler")
public class BackgroundNotificationSchedulerPlugin extends Plugin {

    private static final String TAG = "BGNotifScheduler";

    @PluginMethod
    public void scheduleNotifications(PluginCall call) {
        Log.i(TAG, "scheduleNotifications called from native");

        // 在 WebView 中执行 JS 调度代码，使用共享常量
        // eval 需要 ValueCallback 参数，传 null 表示不关心返回值
        getBridge().eval(NotificationScheduler.SCHEDULING_JS, null);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void registerPeriodicTask(PluginCall call) {
        Log.i(TAG, "registerPeriodicTask called");

        try {
            Context context = getContext();
            if (context == null) {
                call.reject("Context not available");
                return;
            }

            NotificationScheduler.registerPeriodicWork(context);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to register periodic work", e);
            call.reject("Failed to register periodic work: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelPeriodicTask(PluginCall call) {
        Log.i(TAG, "cancelPeriodicTask called");

        try {
            Context context = getContext();
            if (context == null) {
                call.reject("Context not available");
                return;
            }

            NotificationScheduler.cancelPeriodicWork(context);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel periodic work", e);
            call.reject("Failed to cancel periodic work: " + e.getMessage());
        }
    }
}