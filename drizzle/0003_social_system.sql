-- Phase 4: Internal social system
-- Friend requests, symmetric friendships, activity feed, user presence.

-- -------------------------------------------------------------------------
-- friend_requests
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','cancelled')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friend_requests_from_user_id_idx
  ON friend_requests (from_user_id);
CREATE INDEX IF NOT EXISTS friend_requests_to_user_id_idx
  ON friend_requests (to_user_id);
CREATE INDEX IF NOT EXISTS friend_requests_status_idx
  ON friend_requests (status);

-- Only one pending request may exist between any two users in either direction.
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_pair_idx
  ON friend_requests (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id)
  )
  WHERE status = 'pending';

-- Users cannot send requests to themselves.
ALTER TABLE friend_requests
  DROP CONSTRAINT IF EXISTS friend_requests_no_self_request;
ALTER TABLE friend_requests
  ADD CONSTRAINT friend_requests_no_self_request
  CHECK (from_user_id <> to_user_id);

-- -------------------------------------------------------------------------
-- friendships (symmetric, stored once per ordered pair but direction-agnostic)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS friendships_user_id_idx
  ON friendships (user_id);
CREATE INDEX IF NOT EXISTS friendships_friend_id_idx
  ON friendships (friend_id);

-- Ensure only one friendship edge exists for each unordered pair.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair_idx
  ON friendships (
    LEAST(user_id, friend_id),
    GREATEST(user_id, friend_id)
  );

-- Prevent self-friendships.
ALTER TABLE friendships
  DROP CONSTRAINT IF EXISTS friendships_no_self_friend;
ALTER TABLE friendships
  ADD CONSTRAINT friendships_no_self_friend
  CHECK (user_id <> friend_id);

-- -------------------------------------------------------------------------
-- activities (activity feed events)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'watch_session','watch_complete','achievement_unlocked','level_up','friend_added'
  )),
  metadata text,
  visibility text NOT NULL DEFAULT 'friends'
    CHECK (visibility IN ('public','friends','private')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_user_id_idx
  ON activities (user_id);
CREATE INDEX IF NOT EXISTS activities_created_at_idx
  ON activities (created_at DESC);
CREATE INDEX IF NOT EXISTS activities_type_idx
  ON activities (type);

-- -------------------------------------------------------------------------
-- user_presence (one row per online/away/offline user)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_presence (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online','away','offline')),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  currently_watching_video_id text
);

CREATE INDEX IF NOT EXISTS user_presence_last_active_idx
  ON user_presence (last_active_at DESC);
