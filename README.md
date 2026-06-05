# 上班日历 📅

一款简洁实用的上班/下班打卡提醒日历应用，支持桌面端（Electron）和安卓端（Capacitor）。

## ✨ 功能特性

### 📆 日历视图
- 每月日历展示，支持上下月切换
- 每日状态标记：上班、休息、出差
- 8 种颜色标记，自定义标签（最多 8 个）
- 备注记录，每日待办事项
- 中国法定节假日和调休日自动识别
- 点击已选中的日期可收起详情面板

### ⏰ 打卡提醒
- 4 个默认提醒：上班打卡 (08:30)、午休下班 (12:00)、下午上班 (13:30)、下班打卡 (17:30)
- 自定义提醒时间和标签名称
- 手动确认打卡，一键完成
- 打卡记录历史查看（最近 7 天）
- 日历单元格打卡状态指示

### 🔔 通知推送
- **桌面端**：Electron 原生通知，点击即可确认打卡
- **安卓端**：本地通知推送，支持后台提醒

### ✅ 待办管理
- 指定日期待办
- 每周重复待办（按星期几）
- 待办完成状态追踪

### 📊 月度统计
- 上班/休息/出差天数统计
- 可视化比例条
- 标签使用频率统计
- 节假日信息汇总

### ⚙ 设置
- 数据导出（JSON 格式）
- 数据导入
- 6 种主题风格切换：经典、暗黑、清新、粉色、紫色、商务
- 开机自启开关（桌面端）

## 🛠️ 技术栈

| 平台 | 技术 |
|------|------|
| 桌面端 | Electron + 原生 HTML/CSS/JS |
| 安卓端 | Capacitor + Web 技术 |
| 数据存储 | localStorage (Web) / JSON 文件 (Electron) |
| 通知 | Electron Notification API / Capacitor LocalNotifications |

## 📦 安装运行

### 桌面端（Windows）

```bash
# 安装依赖
npm install

# 启动应用
npm start

# 打包为 exe
npm run pack
```

### 安卓端

```bash
# 安装依赖
npm install

# 同步到 Android 项目
npx cap sync android

# 使用 JDK 21 构建 APK
cd android
JAVA_HOME="C:/Program Files/Java/jdk-21" ./gradlew assembleDebug
```

生成的 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`

## 🖥️ 界面导航

底部工具栏提供 4 个主要入口：

| 按钮 | 功能 |
|------|------|
| 📋 **待办** | 待办事项管理 |
| ⏰ **打卡** | 打卡提醒与确认 |
| 📊 **统计** | 月度数据统计 |
| ⚙ **设置** | 导出导入、主题、开机自启 |

## 📁 项目结构

```
├── src/
│   ├── index.html          # 主页面
│   ├── renderer.js         # 前端逻辑
│   ├── styles.css          # 样式
│   ├── holidays.js         # 节假日数据
│   └── web-api.js          # Web/Capacitor API 层
├── main.js                 # Electron 主进程
├── preload.js              # Electron 预加载脚本
├── android/                # Capacitor Android 项目
├── assets/                 # 应用图标
├── capacitor.config.json   # Capacitor 配置
└── package.json
```

## 📱 安卓权限

| 权限 | 用途 |
|------|------|
| `INTERNET` | 网络访问 |
| `POST_NOTIFICATIONS` | 发送通知 |
| `SCHEDULE_EXACT_ALARM` | 精确定时提醒 |
| `RECEIVE_BOOT_COMPLETED` | 开机启动提醒 |

## 📄 License

MIT

---

## 📌 更新日志

### v1.2 (2026-06-05)
- 🌐 新增好友圈功能：发布动态、点赞评论、好友管理
- 👤 个人主页：昵称修改、用户ID分享
- ⚙ Supabase 配置移至设置页面，用户自行配置

### v1.1 (2026-06-05)
- ⚙ 新增设置页面：导出导入、主题切换、开机自启
- 📋⏰ 待办和打卡按钮放大美化
- 🔄 点击已选中日期可收起详情面板
- 📊 统计页面精简

### v1.0 (2026-06-05)
- 📅 日历视图：上班/休息/出差状态标记
- ⏰ 打卡提醒：4个默认提醒，手动确认
- 🔔 通知推送：Electron + Android
- ✅ 待办管理：指定日期和每周重复
- 📊 月度统计
- 🎨 6种主题风格
