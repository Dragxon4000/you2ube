-- Phase 4: Profile system + privacy settings
-- Adds editable profile fields and privacy controls to the existing profiles table.
-- This migration is additive and does not alter the authentication/session model.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "website_url" text,
  ADD COLUMN IF NOT EXISTS "avatar_path" text,
  ADD COLUMN IF NOT EXISTS "profile_visibility" text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "show_watch_history" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "show_xp" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "show_achievements" boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_profile_visibility_check'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_profile_visibility_check"
      CHECK ("profile_visibility" IN ('public', 'friends', 'private'));
  END IF;
END $$;
