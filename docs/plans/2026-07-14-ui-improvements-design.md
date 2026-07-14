# UI 改进设计：日历颜色区分 + 好友圈三页签

> 日期：2026-07-14 | 兼容：桌面 Electron + 安卓 Capacitor WebView

## 一、需求概要

1. **过去日期视觉区分**：已过去的日格加边框或底色，与未来日期明显区分
2. **状态颜色增强**：上班/休息/出差等状态角标着色，配合淡底色辅助辨识
3. **好友圈三页签**：动态 / 好友 / 个人 三个子页面通过顶部 Tab 切换，全部在 Vue 层实现（修复安卓端好友/个人页不可见的问题）

## 二、改动范围

| 模块 | 文件 | 改动类型 |
|------|------|----------|
| 日历颜色 | `src/pages/CalendarView.vue` | 修改 |
| 日历样式 | `src/styles.css` | 修改 |
| 好友圈 | `src/pages/SocialPage.vue` | 修改（新增 Tab + 好友/个人子视图） |
| 新组件 | `src/components/FriendsTab.vue` | **新建** |
| 新组件 | `src/components/ProfileTab.vue` | **新建** |
| 文档 | `docs/plans/2026-07-14-ui-improvements-design.md` | 新建 |

### 不改动的部分
- 底部导航栏结构不变（5 个 tab：日历/打卡/好友/统计/设置）
- 数据模型不变（calendarStore / social API）
- 传统回退层 `.app` 的代码不删除（保持兼容）

---

## 三、设计细节（第 1 部分）：过去日期区分

### 方案
给过去的日格添加 CSS 类 `is-past`，配合主题感知的边框+淡化效果。

### CalendarView.vue 改动

```js
// 在 calendarDays computed 中增加 isPast 判断：
// cd.dateStr < todayStr && !cd.isOther → isPast = true
```

模板中绑定：
```html
:class="{ ..., 'is-past': !cd.isOther && cd.dateStr < todayStr }"
```

### styles.css 新增规则
```css
/* 过去日期：淡淡边框 + 微透明 */
.day-cell.is-past {
  border: 1px solid var(--border, rgba(0,0,0,0.08));
  opacity: 0.78;
}
.day-cell.is-past.today {
  opacity: 1; /* 今天即使在过去判断中也不淡化 */
}
```

### 跨平台注意
- 纯 CSS 类名方案，WebView 和 Electron 渲染一致
- 不依赖任何平台 API，无兼容风险

---

## 四、设计细节（第 2 部分）：状态颜色增强

### 当前问题
Vue 版 `CalendarView.vue` 日格**缺少 `:data-status` 属性**，导致 styles.css 中 7 条状态角标配色规则全部失效。所有角标（班/休/差/假/年/病/事）都是默认白色背景。

### 修复
在日格模板添加 `:data-status` 绑定：
```html
:data-status="dayData(cd.dateStr).status"
```

这会让已有的 CSS 规则立即生效（styles.css 第 538–544 行）：
```css
.day-cell[data-status="work"] .status-label { background: var(--work); }
.day-cell[data-status="rest"] .status-label { background: var(--rest); }
.day-cell[data-status="trip"] .status-label { background: var(--trip); }
/* ... leave/annual/sick/personal 同理 */
```

### 额外增强：状态淡底色
在 `:style` 中追加状态对应的极淡背景色：
```js
// 新增 STATUS_BG_MAP 映射
const STATUS_BG_MAP = {
  work: 'rgba(76,175,80,0.10)',    // 淡绿
  rest: 'rgba(66,165,245,0.10)',     // 淡蓝
  trip: 'rgba(255,152,0,0.10)',      // 淡橙
  leave: 'rgba(156,39,176,0.08)',    // 淡紫
  annual: 'rgba(0,188,212,0.08)',    // 淡青
  sick: 'rgba(245,124,0,0.08)',      // 淡橙红
  personal: 'rgba(141,110,99,0.08)', // 淡棕
}

// :style 合并逻辑（优先级：用户自定义 color > 状态淡底色 > 无色）
:style="dayData(cd.dateStr).color 
  ? { background: dayData(cd.dateStr).color } 
  : (dayData(cd.dateStr).STATUS_BG_MAP?.[dayData(cd.dateStr].status] || {})"
```

> 注意：用户自定义 `color` 优先级最高（不变），只有在用户没手动设色时才应用状态淡底色。

### 效果预览
| 状态 | 角标颜色 | 日格底色 |
|------|----------|----------|
| 上班 (班) | 绿 `var(--work)` | 极淡绿 |
| 休息 (休) | 蓝 `var(--rest)` | 极淡蓝 |
| 出差 (差) | 橙 `var(--trip)` | 极淡橙 |

---

## 五、设计细节（第 3 部分）：好友圈三页签

### 当前问题
- `SocialPage.vue` 只渲染动态流（feed）
- `renderFriends()` / `renderProfile()` 是传统 DOM 方法，渲染到隐藏的 `.app > #social-content`
- `SocialPage.vue` 内的 `switchToFriends()` 调用了这些传统方法，但结果不可见
- 安卓端完全无法访问好友和个人页面

### 方案：Vue 化三页签

#### SocialPage.vue 结构改造
```
SocialPage.vue
├── 顶部 Tab 栏（动态 | 好友 | 我的）
│   ├── 动态 tab（默认激活）
│   ├── 好友 tab
│   └── 我的 tab
└── 内容区
    ├── <FeedTab />       （现有动态流代码内联）
    ├── <FriendsTab.vue>  （新建：好友列表 + 添加好友 + 好友申请）
    └── <ProfileTab.vue>  （新建：头像/昵称/ID/修改昵称）
```

Tab 实现方式：纯 CSS class 切换（`active-tab`），不用 vue-router，零依赖。

#### FriendsTab.vue 功能
- 好友列表（头像 + 昵称 + 删除按钮）
- 待处理好友申请（同意/拒绝）
- 添加好友（输入框 + 搜索/发送请求）
- 数据源复用 `window.getFriends()` / `window.sendFriendRequest()` / `window.acceptFriend()` 等（已有 shims 挂载）

#### ProfileTab.vue 功能
- 头像显示/上传
- 昵称 + 显示 ID
- 修改昵称（调用 `window.updateProfile()`）
- 数据源复用 `window.getProfile()` / `window.updateProfile()` 等

#### 跨平台注意
- 全部 Vue 组件，Electron 和 Capacitor WebView 渲染一致
- 好友/个人数据走已有 Supabase RPC（`get_friends` / `get_profile` / `update_profile`），无需新后端接口
- 头像上传使用已有逻辑（SettingsPage.vue 已有 avatar upload）

---

## 六、发布计划

1. 版本号：3.17.6 → **3.17.7**
2. 流水线：
   - `vite build`（web 资源）
   - `cap sync android`（同步到安卓资源）
   - `gradlew assembleRelease`（JDK 21 打包 APK）
   - 提交 → tag v3.17.7 → push → GitHub Release
   - 更新 `docs/fix-android-2026-07-14.md` 补充本批次记录
3. **salt-seed.js 清理**：本次发布前移除 `src/public/salt-seed.js` 及 index.html 引用（密码恢复已完成，不应随正式版外泄 salt）
