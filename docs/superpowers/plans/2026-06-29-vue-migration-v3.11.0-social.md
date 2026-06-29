# v3.11.0: Social 好友圈迁移为 Vue 组件 实现计划

**Goal:** 将社交页面从 social.js DOM 操作迁移到 Vue SFC

**Architecture:** 单个 SocialPage.vue 页面组件，走 `__vueActivate` 路由模式。复杂 API 逻辑保留在 social.js。

### Task 1: 创建 SocialPage.vue
### Task 2: 路由集成 App.vue + renderer.js
### Task 3: 清理 renderer.js 中社交相关事件
### Task 4: 版本发布 v3.11.0
