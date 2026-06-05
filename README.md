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

### 🌐 好友圈
- 发布文字+图片动态，好友可见
- 点赞、评论互动
- 好友申请 / 同意 / 拒绝
- 个人主页，简单数字ID分享（从1开始）
- 数据通过 Supabase 免费云服务同步
- 图片通过 Supabase Storage 存储（免费1GB）

### ⚙ 设置
- 数据导出（JSON 格式）
- 数据导入
- 6 种主题风格切换：经典、暗黑、清新、粉色、紫色、商务
- 开机自启开关（桌面端）
- 好友圈服务配置

## 🖥️ 界面导航

底部工具栏（直接点击切换页面）：

| 按钮 | 功能 |
|------|------|
| 📅 **日历** | 返回日历主页 |
| ⏰ **打卡** | 打卡提醒与确认 + 待办管理 |
| 🌐 **好友** | 好友圈动态 |
| 📊 **统计** | 月度数据统计 |
| ⚙ **设置** | 导出导入、主题、好友圈配置 |

---

## 🌐 好友圈配置教程（详细步骤）

好友圈功能需要一个免费的 Supabase 云数据库来同步数据。以下是完整配置步骤：

### 第一步：注册 Supabase 账号

1. 打开浏览器，访问 [https://supabase.com](https://supabase.com)
2. 点击右上角 **Start your project** 按钮
3. 选择 **Sign in with GitHub**（推荐）或用邮箱注册
4. 完成登录后进入 Dashboard

### 第二步：创建项目

1. 在 Dashboard 页面，点击 **New Project** 按钮
2. 填写项目信息：
   - **Organization**: 选择或创建一个组织
   - **Project name**: 随便填，比如 `work-calendar`
   - **Database password**: 设置一个密码（记住它，但本项目不需要用）
   - **Region**: 选择 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**（离国内近）
3. 点击 **Create new project**，等待约 1 分钟创建完成

### 第三步：获取连接信息

1. 项目创建完成后，点击左侧菜单最下方的 **Project Settings**（齿轮图标）
2. 点击 **API** 选项卡
3. 找到以下两个信息并复制：
   - **Project URL**: 类似 `https://xxxxxxxx.supabase.co`
   - **anon public key**: 类似 `sb-eyJhbGxxxxxxxxxxxnR5cCI6IkpXVCJ9.xxxxx...`

### 第四步：创建数据库表

1. 在 Supabase Dashboard 左侧菜单，点击 **SQL Editor**
2. 点击 **New query**
3. 复制以下 SQL 代码，粘贴到编辑器中：

```sql
-- 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id SERIAL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 动态表
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 点赞表
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 好友关系表
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- 启用行级安全策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Profiles: 所有人可读，本人可写
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Posts: 所有人可读，本人可写和删除
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (auth.uid() = user_id);

-- Likes: 所有人可读，本人可写和删除
CREATE POLICY "likes_select" ON post_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- Comments: 所有人可读，本人可写和删除
CREATE POLICY "comments_select" ON post_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON post_comments FOR DELETE USING (auth.uid() = user_id);

-- Friendships: 相关用户可读，本人可写
CREATE POLICY "friendships_select" ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friendships_insert" ON friendships FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friendships_update" ON friendships FOR UPDATE USING (auth.uid() = friend_id);
CREATE POLICY "friendships_delete" ON friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 创建索引提升查询速度
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_time ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

-- 存储桶（用于帖子图片上传）
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "post_images_select" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "post_images_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-images' AND auth.role() = 'authenticated');
CREATE POLICY "post_images_delete" ON storage.objects FOR DELETE USING (bucket_id = 'post-images' AND auth.uid()::text = (storage.foldername(name))[1]);
```

4. 点击右下角 **Run** 按钮执行
5. 看到 `Success. No rows returned` 表示成功

### 第五步：开启匿名登录

1. 在 Supabase Dashboard 左侧菜单，点击 **Authentication**
2. 点击 **Providers** 选项卡
3. 找到 **Allow anonymous sign-ins**，将开关**打开**
4. 点击 **Save** 保存

### 第六步：在 App 中配置

1. 打开上班日历 App
2. 点击底部工具栏 **⚙ 设置**
3. 找到 **好友圈服务配置** 区域
4. 填入第三步获取的：
   - **Project URL**: 粘贴你的 URL
   - **Anon Key**: 粘贴你的 Key
5. 点击 **💾 保存配置**
6. 点击 **🔍 测试连接**，会显示详细诊断结果，全部 ✅ 即可

### 第七步：开始使用

1. 点击底部工具栏 **🌐 好友** 进入好友圈
2. 点击 **我的** 标签页，复制你的**数字ID**（如 `1`、`2`）发给朋友
3. 朋友在 **好友** 标签页输入你的数字ID，点击添加
4. 你收到好友申请后点击同意
5. 之后就可以互相看到动态了！

### ⚠️ 注意事项

- Supabase 免费额度：50,000 月活用户、500MB 数据库、1GB 存储空间，日常使用完全够用
- Anon Key 是公开密钥，安全的，不会泄露数据（有行级安全策略保护）
- 一个 Supabase 项目可以多人共用，每个人只需要在 App 里填相同的 URL 和 Key
- 需要开启 **Allow anonymous sign-ins**，否则无法登录和发帖
- 图片上传需要在 SQL Editor 中执行存储桶相关 SQL（见上方第四步）
- 升级用户需执行：`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_id SERIAL UNIQUE;`
- 升级用户需执行：`ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';`


---

## 🛠️ 技术栈

| 平台 | 技术 |
|------|------|
| 桌面端 | Electron + 原生 HTML/CSS/JS |
| 安卓端 | Capacitor + Web 技术 |
| 数据存储 | localStorage (本地) / Supabase (云端同步) |
| 通知 | Electron Notification API / Capacitor LocalNotifications |
| 好友圈后端 | Supabase (PostgreSQL + Auth) |

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

## 📁 项目结构

```
├── src/
│   ├── index.html          # 主页面
│   ├── renderer.js         # 前端逻辑
│   ├── styles.css          # 样式
│   ├── social.css          # 好友圈样式
│   ├── social.js           # 好友圈逻辑
│   ├── supabase.js         # Supabase API 封装
│   ├── holidays.js         # 节假日数据
│   └── web-api.js          # Web/Capacitor API 层
├── lib/
│   └── supabase.min.js     # Supabase JS 本地库（CDN fallback）
├── main.js                 # Electron 主进程
├── preload.js              # Electron 预加载脚本
├── supabase-setup.sql      # 数据库初始化 SQL
├── android/                # Capacitor Android 项目
├── assets/                 # 应用图标
├── capacitor.config.json   # Capacitor 配置
└── package.json
```

## 📱 安卓权限

| 权限 | 用途 |
|------|------|
| `INTERNET` | 网络访问（好友圈同步） |
| `POST_NOTIFICATIONS` | 发送通知 |
| `SCHEDULE_EXACT_ALARM` | 精确定时提醒 |
| `RECEIVE_BOOT_COMPLETED` | 开机启动提醒 |

## 📄 License

MIT

---

## 📌 更新日志

### v1.4 (2026-06-05)
- 📷 好友圈支持发布图片+文字动态
- 🗄️ 图片存储使用 Supabase Storage（需额外执行存储桶SQL）

### v1.3 (2026-06-05)
- 🔢 好友圈改用简单数字ID（从1开始），添加好友更方便
- 🔧 连接测试升级为详细诊断面板，逐步检查配置问题
- 🛡️ 会话过期自动重新登录，修复发布失败和加载失败问题
- 📦 Supabase JS 库本地打包，CDN 作为备用，解决国内加载问题
- 🧭 导航改为直接切换页面，不再来回跳转
- 📋 待办事项合并到打卡页面

### v1.2 (2026-06-05)
- 🌐 新增好友圈功能：发布动态、点赞评论、好友管理
- 👤 个人主页：昵称修改、用户ID分享
- ⚙ Supabase 配置移至设置页面，用户自行配置
- 🔒 移除硬编码凭据，保护用户数据安全

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
