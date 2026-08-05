-- Phase 5: Official YouTube embedded playback + continue watching.
-- Add a separately stored resume position, preserve historical progress, and
-- enforce one durable watch record for each user/video pair.

ALTER TABLE "watch_sessions"
  ADD COLUMN IF NOT EXISTS "resume_position_seconds" integer NOT NULL DEFAULT 0;

-- Older builds did not enforce one row per user/video. Retain the most recent
-- record for each pair before creating the unique index.
WITH ranked_sessions AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id", "video_id"
      ORDER BY "last_watched_at" DESC, "started_at" DESC, "id" DESC
    ) AS row_number
  FROM "watch_sessions"
)
DELETE FROM "watch_sessions" AS duplicate
USING ranked_sessions
WHERE duplicate."id" = ranked_sessions."id"
  AND ranked_sessions.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "watch_sessions_user_video_unique"
  ON "watch_sessions" ("user_id", "video_id");
