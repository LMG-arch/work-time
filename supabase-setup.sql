-- 上班日历 - 好友圈数据库初始化
-- 在 Supabase Dashboard > SQL Editor 中执行

-- 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id SERIAL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '',
  avatar TEXT DEFAULT '',
  username TEXT UNIQUE,
  password_hash TEXT,
  linked_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 动态表
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 点赞表
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(post_id, user_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 好友关系表
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, friend_id)
);

-- 用户数据同步表（日历/待办/提醒等本地数据云端备份）
CREATE TABLE IF NOT EXISTS user_data (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 获取有效用户ID（如果当前用户有 linked_id 则返回 linked_id，否则返回自身）
CREATE OR REPLACE FUNCTION get_effective_user_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  uid UUID;
  linked UUID;
BEGIN
  uid := auth.uid();
  -- 不过滤 deleted_at：清除数据后匿名用户 profile 会被软删除，但仍需读取 linked_id
  SELECT linked_id INTO linked FROM profiles WHERE id = uid;
  RETURN COALESCE(linked, uid);
END;
$$;

-- Profiles: 所有人可读，本人可写（通过 linked_id 关联）
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id OR get_effective_user_id() = id);

-- Posts: 所有人可读，有效用户可写删
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (get_effective_user_id() = user_id);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (get_effective_user_id() = user_id);

-- Likes: 所有人可读，有效用户可写删
CREATE POLICY "likes_select" ON post_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON post_likes FOR INSERT WITH CHECK (get_effective_user_id() = user_id);
CREATE POLICY "likes_delete" ON post_likes FOR DELETE USING (get_effective_user_id() = user_id);

-- Comments: 所有人可读，有效用户可写删
CREATE POLICY "comments_select" ON post_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON post_comments FOR INSERT WITH CHECK (get_effective_user_id() = user_id);
CREATE POLICY "comments_delete" ON post_comments FOR DELETE USING (get_effective_user_id() = user_id);

-- Friendships: 有效用户相关可读写
CREATE POLICY "friendships_select" ON friendships FOR SELECT
  USING (get_effective_user_id() = user_id OR get_effective_user_id() = friend_id);
CREATE POLICY "friendships_insert" ON friendships FOR INSERT WITH CHECK (get_effective_user_id() = user_id);
CREATE POLICY "friendships_update" ON friendships FOR UPDATE
  USING (get_effective_user_id() = friend_id);
CREATE POLICY "friendships_delete" ON friendships FOR DELETE
  USING (get_effective_user_id() = user_id OR get_effective_user_id() = friend_id);

-- User Data: 有效用户可读写
CREATE POLICY "user_data_select" ON user_data FOR SELECT USING (get_effective_user_id() = user_id);
CREATE POLICY "user_data_insert" ON user_data FOR INSERT WITH CHECK (get_effective_user_id() = user_id);
CREATE POLICY "user_data_update" ON user_data FOR UPDATE USING (get_effective_user_id() = user_id);

-- 管理员重置函数（软删除，保留数据可恢复）
CREATE OR REPLACE FUNCTION reset_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1
  ) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;

  UPDATE post_comments SET deleted_at = NOW() WHERE deleted_at IS NULL;
  UPDATE post_likes SET deleted_at = NOW() WHERE deleted_at IS NULL;
  UPDATE posts SET deleted_at = NOW() WHERE deleted_at IS NULL;
  UPDATE friendships SET deleted_at = NOW() WHERE deleted_at IS NULL;
  UPDATE profiles SET deleted_at = NOW() WHERE deleted_at IS NULL AND display_id != 1;
END;
$$;

-- 管理员恢复函数（从回收站恢复）
CREATE OR REPLACE FUNCTION restore_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1
  ) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;

  UPDATE post_comments SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
  UPDATE post_likes SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
  UPDATE posts SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
  UPDATE friendships SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
  UPDATE profiles SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
END;
$$;

-- 管理员清空回收站（永久删除）
CREATE OR REPLACE FUNCTION empty_trash()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1
  ) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;

  DELETE FROM post_comments WHERE deleted_at IS NOT NULL;
  DELETE FROM post_likes WHERE deleted_at IS NOT NULL;
  DELETE FROM posts WHERE deleted_at IS NOT NULL;
  DELETE FROM friendships WHERE deleted_at IS NOT NULL;
  DELETE FROM profiles WHERE deleted_at IS NOT NULL;
END;
$$;

-- 查询回收站统计
CREATE OR REPLACE FUNCTION get_trash_stats()
RETURNS TABLE(table_name text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1
  ) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;

  RETURN QUERY SELECT 'profiles'::text, (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NOT NULL);
  RETURN QUERY SELECT 'posts'::text, (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL);
  RETURN QUERY SELECT 'comments'::text, (SELECT COUNT(*) FROM post_comments WHERE deleted_at IS NOT NULL);
  RETURN QUERY SELECT 'likes'::text, (SELECT COUNT(*) FROM post_likes WHERE deleted_at IS NOT NULL);
  RETURN QUERY SELECT 'friendships'::text, (SELECT COUNT(*) FROM friendships WHERE deleted_at IS NOT NULL);
END;
$$;

-- 查询回收站各项占用大小（行数 + 估算字节）
CREATE OR REPLACE FUNCTION get_trash_sizes()
RETURNS TABLE(table_name text, deleted_count bigint, total_size text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;
  RETURN QUERY SELECT 'profiles'::text, (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NOT NULL),
    pg_size_pretty((SELECT pg_total_relation_size('profiles')));
  RETURN QUERY SELECT 'posts'::text, (SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL),
    pg_size_pretty((SELECT pg_total_relation_size('posts')));
  RETURN QUERY SELECT 'comments'::text, (SELECT COUNT(*) FROM post_comments WHERE deleted_at IS NOT NULL),
    pg_size_pretty((SELECT pg_total_relation_size('post_comments')));
  RETURN QUERY SELECT 'likes'::text, (SELECT COUNT(*) FROM post_likes WHERE deleted_at IS NOT NULL),
    pg_size_pretty((SELECT pg_total_relation_size('post_likes')));
  RETURN QUERY SELECT 'friendships'::text, (SELECT COUNT(*) FROM friendships WHERE deleted_at IS NOT NULL),
    pg_size_pretty((SELECT pg_total_relation_size('friendships')));
END;
$$;

-- 选择性清除（软删除指定表的数据）
CREATE OR REPLACE FUNCTION reset_selected(p_tables TEXT[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;
  IF 'comments' = ANY(p_tables) THEN UPDATE post_comments SET deleted_at = NOW() WHERE deleted_at IS NULL; END IF;
  IF 'likes' = ANY(p_tables) THEN UPDATE post_likes SET deleted_at = NOW() WHERE deleted_at IS NULL; END IF;
  IF 'posts' = ANY(p_tables) THEN UPDATE posts SET deleted_at = NOW() WHERE deleted_at IS NULL; END IF;
  IF 'friendships' = ANY(p_tables) THEN UPDATE friendships SET deleted_at = NOW() WHERE deleted_at IS NULL; END IF;
  IF 'profiles' = ANY(p_tables) THEN UPDATE profiles SET deleted_at = NOW() WHERE deleted_at IS NULL AND display_id != 1; END IF;
END;
$$;

-- 选择性恢复（从回收站恢复指定表的数据）
CREATE OR REPLACE FUNCTION restore_selected(p_tables TEXT[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;
  IF 'comments' = ANY(p_tables) THEN UPDATE post_comments SET deleted_at = NULL WHERE deleted_at IS NOT NULL; END IF;
  IF 'likes' = ANY(p_tables) THEN UPDATE post_likes SET deleted_at = NULL WHERE deleted_at IS NOT NULL; END IF;
  IF 'posts' = ANY(p_tables) THEN UPDATE posts SET deleted_at = NULL WHERE deleted_at IS NOT NULL; END IF;
  IF 'friendships' = ANY(p_tables) THEN UPDATE friendships SET deleted_at = NULL WHERE deleted_at IS NOT NULL; END IF;
  IF 'profiles' = ANY(p_tables) THEN UPDATE profiles SET deleted_at = NULL WHERE deleted_at IS NOT NULL; END IF;
END;
$$;

-- 选择性清空回收站（永久删除指定表的数据）
CREATE OR REPLACE FUNCTION empty_selected(p_tables TEXT[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = get_effective_user_id() AND display_id = 1) THEN
    RAISE EXCEPTION '仅管理员可操作';
  END IF;
  IF 'comments' = ANY(p_tables) THEN DELETE FROM post_comments WHERE deleted_at IS NOT NULL; END IF;
  IF 'likes' = ANY(p_tables) THEN DELETE FROM post_likes WHERE deleted_at IS NOT NULL; END IF;
  IF 'posts' = ANY(p_tables) THEN DELETE FROM posts WHERE deleted_at IS NOT NULL; END IF;
  IF 'friendships' = ANY(p_tables) THEN DELETE FROM friendships WHERE deleted_at IS NOT NULL; END IF;
  IF 'profiles' = ANY(p_tables) THEN DELETE FROM profiles WHERE deleted_at IS NOT NULL; END IF;
END;
$$;

-- 注册账号（用户名+密码哈希，绑定到当前匿名用户）
CREATE OR REPLACE FUNCTION register_username(p_username TEXT, p_password_hash TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM profiles WHERE username = p_username AND deleted_at IS NULL;
  IF existing_id IS NOT NULL THEN
    RETURN json_build_object('error', '用户名已存在');
  END IF;

  UPDATE profiles SET username = p_username, password_hash = p_password_hash
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO profiles (id, nickname, username, password_hash)
    VALUES (auth.uid(), p_username, p_username, p_password_hash);
  END IF;

  RETURN json_build_object('user_id', auth.uid());
END;
$$;

-- 登录账号（验证密码，通过 linked_id 关联，不迁移数据）
CREATE OR REPLACE FUNCTION login_username(p_username TEXT, p_password_hash TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user UUID;
  curr UUID;
BEGIN
  curr := auth.uid();

  SELECT id INTO target_user FROM profiles
  WHERE username = p_username AND password_hash = p_password_hash AND deleted_at IS NULL;

  IF target_user IS NULL THEN
    RETURN json_build_object('error', '用户名或密码错误');
  END IF;

  IF target_user = curr THEN
    RETURN json_build_object('user_id', curr);
  END IF;

  -- 设置 linked_id，指向目标用户
  INSERT INTO profiles (id, nickname, linked_id)
  VALUES (curr, 'linked', target_user)
  ON CONFLICT (id) DO UPDATE SET linked_id = target_user;

  RETURN json_build_object('user_id', target_user);
END;
$$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_time ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON profiles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_likes_deleted ON post_likes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_comments_deleted ON post_comments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_friendships_deleted ON friendships(deleted_at);

-- 存储桶（用于帖子图片）
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true) ON CONFLICT (id) DO NOTHING;

-- 存储策略：所有人可读，登录用户只能上传和删除自己的文件
CREATE POLICY "post_images_select" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "post_images_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'post-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "post_images_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'post-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
