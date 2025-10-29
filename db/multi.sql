-- 0) ใช้ UUID แบบ gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) สร้าง ENUM ที่ใช้ร่วมกัน
CREATE TYPE report_target   AS ENUM ('post','comment','user');
CREATE TYPE report_status   AS ENUM ('pending','dismissed','action_taken');
CREATE TYPE post_status     AS ENUM ('published','unpublish');
CREATE TYPE media_type      AS ENUM ('image','video','link');
CREATE TYPE post_category   AS ENUM ('2D art','3D model','Graphic Design','Animation','Game','UX/UI design');

-- 2) ตารางหลัก: users
CREATE TABLE IF NOT EXISTS users (
  user_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT UNIQUE NOT NULL,
  username     VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  email        VARCHAR(100) UNIQUE NOT NULL,
  role         TEXT NOT NULL DEFAULT 'user',
  status       TEXT DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- 3) groups
CREATE TABLE IF NOT EXISTS groups (
  group_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(user_id),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) group_members (PK แบบคอมโพสิต)
CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 5) posts
CREATE TABLE IF NOT EXISTS posts (
  post_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  title         VARCHAR(150),
  body          TEXT,
  status        post_status DEFAULT 'unpublish',
  published_at  TIMESTAMPTZ,
  category      post_category NOT NULL,
  s3_bucket     TEXT,
  s3_key        TEXT,
  group_id      UUID REFERENCES groups(group_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- 6) comments
CREATE TABLE IF NOT EXISTS comments (
  comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID REFERENCES posts(post_id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(user_id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 7) likes (PK แบบคอมโพสิต)
CREATE TABLE IF NOT EXISTS likes (
  user_id    UUID REFERENCES users(user_id),
  post_id    UUID REFERENCES posts(post_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- 8) post_media
CREATE TABLE IF NOT EXISTS post_media (
  post_media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID REFERENCES posts(post_id) ON DELETE CASCADE,
  media_type    media_type,
  order_index   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 9) reports
CREATE TABLE IF NOT EXISTS reports (
  reports_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID REFERENCES users(user_id) NOT NULL,
  report_type  report_target NOT NULL,
  target_id    UUID NOT NULL,
  reason       TEXT,
  note         TEXT,
  status       report_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (ออปชัน) ทริกเกอร์อัปเดต updated_at อัตโนมัติสำหรับตารางที่มีคอลัมน์นี้
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_posts_updated_at'
  ) THEN
    CREATE TRIGGER trg_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at'
  ) THEN
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_groups_updated_at'
  ) THEN
    CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
