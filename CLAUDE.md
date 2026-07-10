# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

以第一性原理!从原始需求和问题本质出发，不从惯例或模板出发。
1。不要假设我清楚自己想要什么。
动机或目标不清晰时，停下来讨论。
目标清晰但路径不是最短的，
直接告诉我并建议更好的办法。
3.遇到问题追根因，不打补丁。每个决策都要能回答”为什么”
4。输出说重点，砍掉一切不改变决策的信息。
## 项目概述

上班日历 — 跨平台打卡提醒日历应用，支持 Electron 桌面端和 Capacitor Android 端。项目正处于从纯 JS 向 Vue.js (3.5+) 渐进式迁移阶段。

## 常用命令

```bash
npm run dev            # 启动 Vite 开发服务器并开启 Electron 调试
npm start              # 直接启动 Electron（跳过 Vite）
npm run build          # 构建生产环境 Web 资源
npm run pack           # 构建、打包 Windows x64 应用
npx cap sync android   # 同步 Web 资源到 Android 项目
```

## 架构要点

**混合架构**：
- `main.js` (Electron 主进程)：负责窗口管理、原子化 JSON 数据持久化、开机自启、系统级通知。
- `preload.js`：通过 `calendarAPI` 安全暴露 IPC 接口。
- `src/` (渲染进程)：
    - **Vue 模块**：主要业务逻辑实现（日历视图、设置、统计、社交），通过 Vite 构建。
    - **旧版 JS 模块**：作为兼容层或正在迁移的代码（`calendar.js`, `todos.js` 等），通过全局变量与 Vue 桥接。
    - **独立 Vue 实例**：目前存在多个挂载点（`vue-calendar.js`, `vue-todos.js` 等），正逐步收敛。

**数据存储**：
- 桌面端：原子化写入 `userData/calendar-data.json`。
- 云端���Supabase PostgreSQL + RLS + 智能时间戳合并同步。

## 开发规范

**版本管理**：每次修改代码后，必须更新文档并推送到 GitHub 进行版本管理。提交信息使用中文，格式参考 git log 中的约定（如 `fix:`、`feat:` 前缀）。

**版本发布流程**：每次发布新版本必须完成以下步骤：
1. 更新 `package.json` 中的版本号
2. 更新 `android/app/build.gradle` 中的 `versionCode`（+1）和 `versionName`
3. 更新 `version.json` 中的版本号、下载链接和更新日志
4. 更新 `README.md` 中的更新日志
5. 构建签名 APK：`cd android && ./gradlew assembleRelease`
6. 复制 APK 并重命名为 `work-calendar-v{版本号}.apk`
7. 创建 GitHub Release 并上传 APK：`gh release create v{版本号} --title "v{版本号}" work-calendar-v{版本号}.apk`
8. 推送代码到 GitHub

**工作流程**：所有操作都在 Claude Code 技能（superpowers）指导下进行，遵循技能流程规范。

**代码风格**：
- **混合开发**：核心业务逻辑正由纯 JS 向 Vue.js (3.5+) 迁移。
- **构建链**：使用 Vite 进行开发调试和生产构建。`src/` 目录包含 Vue 源码及 legacy JS 模块。
- **状态管理**：使用 `src/store.js` (Reactive) 统一管理 Vue 状态，并通过 window 全局变量与旧模块桥接。
- **跨平台一致性**：修改功能时需同时考虑桌面端 (Electron) 和安卓端 (Capacitor) 的兼容性。

**项目约定**：
- `.claude/` 与 `.workbuddy/` 目录已加入 `.gitignore`，不入版本控制

**注意事项**：
- `holidays.js` 包含中国法定节假日数据，需手动更新年份
- `lunar.js` 实现农历计算，月份标题显示天干地支+生肖
- 好友圈管理员功能：数字 ID 为 1 的用户拥有重置服务器数据的权限
- 数据同步支持智能时间戳比较，删除操作使用墓碑标记机制
