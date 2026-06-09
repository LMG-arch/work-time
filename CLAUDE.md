# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

上班日历 — 跨平台打卡提醒日历应用，支持 Electron 桌面端和 Capacitor Android 端。纯 HTML/CSS/JavaScript，无框架、无构建步骤、无 TypeScript。

## 常用命令

```bash
npm start              # 启动 Electron 桌面端开发模式
npm run pack           # 打包 Windows x64 应用（electron-packager + 设置图标 + 清理语言文件）
npx cap sync android   # 同步 Web 资源到 Android 项目
```

Android 构建需要 `JAVA_HOME` 和 `ANDROID_HOME` 环境变量，然后在 `android/` 目录执行 `./gradlew assembleRelease`。

## 架构要点

**三进程架构**：
- `main.js` — Electron 主进程：窗口管理、数据持久化（JSON 文件存到 userData）、开机自启、通知推送、IPC 服务端
- `preload.js` — 通过 `contextBridge` 暴露 `calendarAPI` 给渲染进程
- `src/` — 渲染进程，纯 JS 单页应用，各模块通过全局变量协作

**核心模块**（全在 `src/` 下）：
- `renderer.js` — 主渲染逻辑，页面路由和全局状态
- `calendar.js` — 日历视图、日期选择、状态标记
- `reminders.js` — 打卡提醒和确认逻辑
- `todos.js` — 待办管理
- `social.js` — 好友圈社交功能
- `supabase.js` — Supabase 云服务集成（认证、数据同步、Storage）
- `stats.js` — 月度统计
- `settings.js` — 设置页
- `utils.js` — 工具函数
- `web-api.js` — 平台适配层，安卓端通过 Capacitor 桥接原生 API

**跨平台策略**：同一套 `src/` 代码同时用于 Electron 和 Capacitor。`web-api.js` 检测平台并提供统一 API（通知、文件系统等）。

**数据存储**：
- 桌面端：JSON 文件写入 Electron `userData` 目录
- 云端：Supabase PostgreSQL + RLS 行级安全策略
- 好友圈图片：Supabase Storage

**Supabase 客户端库**：`lib/supabase.min.js` 和 `src/lib/supabase.min.js`（两份副本），非 npm 依赖。

## 开发规范

**版本管理**：每次修改代码后，必须更新文档并推送到 GitHub 进行版本管理。提交信息使用中文，格式参考 git log 中的约定（如 `fix:`、`feat:` 前缀）。

**工作流程**：所有操作都在 Claude Code 技能（superpowers）指导下进行，遵循技能流程规范。

**代码风格**：
- 纯 JavaScript，不引入 TypeScript 或框架
- 无构建步骤，`src/` 目录即为最终 Web 资源
- 模块间通过全局变量和 DOM 事件通信，不使用 ES modules 的 import/export
- 修改功能时需同时考虑桌面端和安卓端的兼容性

**注意事项**：
- `holidays.js` 包含中国法定节假日数据，需手动更新年份
- `lunar.js` 实现农历计算，月份标题显示天干地支+生肖
- 好友圈管理员功能：数字 ID 为 1 的用户拥有重置服务器数据的权限
- 数据同步支持智能时间戳比较，删除操作使用墓碑标记机制
