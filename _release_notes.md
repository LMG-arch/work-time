## 修复插件异常导致闪退（第三道防线）

### 崩溃日志实锤
用户提供的崩溃浮层截图显示：
```
Thread: CapacitorPlugins
java.lang.RuntimeException: java.lang.reflect.InvocationTargetException
  at com.getcapacitor.Bridge.lambda$callPluginMethod$0(Bridge.java:856)
  → Handler.handleCallback → dispatchMessage
```
设备：vivo V2419A (SDK 36 / Android 16)，WebView：com.google.android.webview

### 根因
`Bridge.callPluginMethod()` 在 `plugin.invoke()` 抛异常时（无论哪个插件、什么原因），**不是通知 JS 侧错误后继续运行，而是 `throw new RuntimeException(ex)` 重新抛出**（Bridge.java:856）。这个 RuntimeException 跑到 CapacitorPlugins 线程的 Handler 里没有任何捕获，直接杀进程。

**这意味着之前修的两个问题（启动 NPE + WebView 数据腐化）虽然都生效了，但只要任何一个插件（Filesystem / LocalNotifications）在运行时抛异常，App 照样崩。** 这是一个独立的崩溃路径。

### 修复
将 Bridge.java:856 的 `throw new RuntimeException(ex)` 改为：
- 调用 `call.errorCallback()` 通知 JS 侧
- **不重新抛出**——让 App 继续运行

效果：**任何插件失败都不会再导致闪退**。JS 侧会收到错误回调并可以优雅降级（storage.js / reminders.js 都有 try/catch 兜底）。

### 累积修复清单
| 版本 | 修复内容 | 状态 |
|------|---------|------|
| v3.17.16 | 启动期 WebView NPE 空值保护 | 已生效 |
| v3.17.18 | WebView 数据目录按版本隔离 + 崩溃自恢复 | 已生效 |
| **v3.17.19** | **Bridge 插件崩溃防护（不再 throw 杀进程）** | **本次新增** |

### 验证
- 签名：apksigner v2 校验通过。
- 反编译确认 crash shield 逻辑（errorCallback + "Plugin invoke error"）已编入 APK（9 处引用）。
- postinstall 脚本已更新，同时维护两处补丁（NPE guard + crash shield）。
