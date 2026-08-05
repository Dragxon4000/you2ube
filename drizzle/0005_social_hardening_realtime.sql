-- Phase 4 hardening: canonical social schema + Supabase Realtime publication.
-- This migration upgrades the prior Phase 4 implementation without adding a
-- second auth/database system.

BEGIN;

-- Friend request vocabulary follows the product API contract.
ALTER TABLE friend_requests RENAME COLUMN from_user_id TO sender_id;
ALTER TABLE friend_requests RENAME COLUMN to_user_id TO receiver_id;

DROP INDEX IF EXISTS friend_requests_from_user_id_idx;
DROP INDEX IF EXISTS friend_requests_to_user_id_idx;
CREATE INDEX IF NOT EXISTS friend_requests_sender_id_idx ON friend_requests (sender_id);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_id_idx ON friend_requests (receiver_id);

-- Convert prior directional friendship rows into one canonical edge.
ALTER TABLE friendships RENAME COLUMN user_id TO user_a;
ALTER TABLE friendships RENAME COLUMN friend_id TO user_b;

UPDATE friendships
SET user_a = LEAST(user_a, user_b),
    user_b = GREATEST(user_a, user_b);

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_a, user_b ORDER BY created_at ASC, id ASC) AS row_number
  FROM friendships
)
DELETE FROM friendships f
USING ranked r
WHERE f.id = r.id AND r.row_number > 1;

DROP INDEX IF EXISTS friendships_user_id_idx;
DROP INDEX IF EXISTS friendships_friend_id_idx;
DROP INDEX IF EXISTS friendships_unique_pair_idx;
CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships (user_a);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships (user_b);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_user_pair_unique ON friendships (user_a, user_b);

CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_user_achievement_unique
  ON user_achievements (user_id, achievement_id);

ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_no_self_friend;
ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_canonical_pair;
ALTER TABLE friendships ADD CONSTRAINT friendships_canonical_pair CHECK (user_a < user_b);

-- Presence now carries both online state and the currently watched title.
ALTER TABLE user_presence RENAME TO presence;
ALTER TABLE presence RENAME COLUMN last_active_at TO last_seen;
ALTER TABLE presence RENAME COLUMN currently_watching_video_id TO current_video_id;
ALTER TABLE presence ADD COLUMN IF NOT EXISTS current_video_title text;
ALTER TABLE presence ADD COLUMN IF NOT EXISTS custom_status text;

ALTER INDEX IF EXISTS user_presence_last_active_idx RENAME TO presence_last_seen_idx;
CREATE INDEX IF NOT EXISTS presence_status_idx ON presence (status);
CREATE INDEX IF NOT EXISTS presence_last_seen_idx ON presence (last_seen DESC);

-- Activity types and metadata match the API contract.
UPDATE activities SET type = 'watch_start' WHERE type = 'watch_session';
UPDATE activities SET type = 'achievement_unlock' WHERE type = 'achievement_unlocked';
ALTER TABLE activities
  ALTER COLUMN metadata TYPE jsonb
  USING CASE
    WHEN metadata IS NULL OR btrim(metadata) = '' THEN NULL
    ELSE metadata::jsonb
  END;

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (
  type IN ('watch_start','watch_complete','level_up','achievement_unlock','friend_added')
);

-- Supabase-hosted projects expose this publication. The conditional block
-- keeps local plain PostgreSQL development safe when it does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friend_requests'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activities'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activities';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'presence'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.presence';
    END IF;
  END IF;
END $$;

COMMIT;
