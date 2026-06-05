-- 上班日历 - 好友圈数据库初始化
-- 在 Supabase Dashboard > SQL Editor 中执行

-- 用户资料表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id SERIAL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '',
  avatar TEXT DEFAULT '',
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

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Profiles: 所有人可读，本人可写
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Posts: 所有人可读（RLS过滤在应用层做），本人可写
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (auth.uid() = user_id);

-- Likes: 所有人可读，本人可写
CREATE POLICY "likes_select" ON post_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- Comments: 所有人可读，本人可写
CREATE POLICY "comments_select" ON post_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON post_comments FOR DELETE USING (auth.uid() = user_id);

-- Friendships: 相关用户可读，本人可写
CREATE POLICY "friendships_select" ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friendships_insert" ON friendships FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friendships_update" ON friendships FOR UPDATE
  USING (auth.uid() = friend_id);
CREATE POLICY "friendships_delete" ON friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 管理员重置函数（软删除，保留数据可恢复）
CREATE OR REPLACE FUNCTION reset_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND display_id = 1
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
    SELECT 1 FROM profiles WHERE id = auth.uid() AND display_id = 1
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
    SELECT 1 FROM profiles WHERE id = auth.uid() AND display_id = 1
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
    SELECT 1 FROM profiles WHERE id = auth.uid() AND display_id = 1
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_time ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON profiles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_likes_deleted ON post_likes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_comments_deleted ON post_comments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_friendships_deleted ON friendships(deleted_at);

-- 存储桶（用于帖子图片）
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true) ON CONFLICT (id) DO NOTHING;

-- 存储策略：所有人可读，登录用户可上传和删除
CREATE POLICY "post_images_select" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "post_images_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-images');
CREATE POLICY "post_images_delete" ON storage.objects FOR DELETE USING (bucket_id = 'post-images');
