# Vue 渐进式迁移总体设计

## 架构总图

迁移完成后 Vue 与现有 JS 的边界：

```
┌──────────────────────────────────────┐
│  #app (Vue 页面路由)                   │
│  ├─ SettingsPage.vue  ✔ v3.5.0       │
│  ├─ StatsPage.vue       v3.8.0       │
│  └─ SocialPage.vue      v3.12.0      │
├──────────────────────────────────────┤
│  嵌入挂载点 (Vue 独立实例)              │
│  ├─ #todo-list-vue       v3.6.0       │
│  ├─ #todo-view-vue       v3.6.0       │
│  ├─ #todo-modal-vue      v3.6.0       │
│  ├─ #reminder-list-vue   v3.7.0       │
│  ├─ #reminder-history-vue v3.7.0      │
│  ├─ #detail-panel-vue    v3.9.0       │
│  └─ #calendar-grid-vue   v3.10.0      │
├──────────────────────────────────────┤
│  现有 JS 遗留                           │
│  ├─ #calendar-header      v3.10.0     │
│  ├─ #toolbar (固定)                    │
│  ├─ renderer.js           v3.13.0     │
│  └─ utils.js / lunar.js / holidays.js │
└──────────────────────────────────────┘
```

## 发布顺序

| 版本 | 模块 | 迁移方式 | 新文件 |
|------|------|---------|--------|
| v3.6.0 | todos | 独立挂载点 | vue-todos.js, TodoListApp.vue, TodoViewApp.vue, TodoItem.vue, TodoModal.vue |
| v3.7.0 | reminders | 独立挂载点 | vue-reminders.js, ReminderList.vue, ReminderHistory.vue, ReminderSettings.vue |
| v3.8.0 | stats | 页面路由 | StatsPage.vue, StatsSummary.vue, StatsTags.vue, StatsHolidays.vue |
| v3.9.0 | calendar-详情面板 | 独立挂载点 | DetailPanel.vue, StatusButtons.vue, ColorPicker.vue, TagEditor.vue, NoteEditor.vue |
| v3.10.0 | calendar-日历格子 | 页面路由 | CalendarGrid.vue, DayCell.vue, LunarLabel.vue, HolidayBadge.vue |
| v3.11.0 | calendar-头部导航 | 页面路由 | CalendarHeader.vue |
| v3.12.0 | social | 页面路由 | SocialPage.vue, PostList.vue, PostCard.vue, PostModal.vue, ... |
| v3.13.0 | renderer 收尾 | 清理 | 删除旧模块脚本引用 |

## 两条路径

| 路径 | 挂载方式 | 适用模块 |
|------|---------|---------|
| **页面路由** | `#app` + `__vueActivate/__vueDeactivate` | settings, stats, social |
| **嵌入挂载** | 独立 `createApp` → 预埋 DOM 容器 | todos, reminders, calendar 详情面板 |

## 数据层原则

- 所有 Vue 组件通过 `window.*` 访问全局数据和现有函数
- 不改造 preload.js / main.js / IPC 通道
- 不引入 Vue Router、Pinia 等额外框架
- 每个嵌入组件暴露 `__refresh*` 函数给 renderer.js 调用，触发重新渲染
