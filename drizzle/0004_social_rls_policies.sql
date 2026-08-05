-- Phase 4: RLS policies for Supabase Realtime / direct Postgres access.
--
-- Context: you2ube uses a custom cookie-based identity system rather than
-- Supabase Auth. All writes to social tables must go through the server-side
-- API routes (which validate the you2ube session cookie). The policies below
-- enforce that direct PostgREST / Realtime client writes are denied for
-- everyone, regardless of role.
--
-- The social RLS read policies in prior drafts referenced Supabase's auth.uid()
-- helper, which is only present when the database is hosted by Supabase and
-- paired with Supabase Auth. Because this sandbox runs a plain PostgreSQL
-- instance without the `auth` schema, those policies are intentionally NOT
-- applied here. When this database is attached to a Supabase project for
-- Realtime/broadcast, the read policies should be added in a separate migration
-- that either (a) signs the browser Supabase client into Supabase Auth with a
-- matching user JWT, or (b) uses a custom claims/JWT + RLS helper.
--
-- In all deployment modes, the application continues to use its existing
-- httpOnly session cookie for authorization on all server API routes.

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence    ENABLE ROW LEVEL SECURITY;

-- Deny direct client writes through PostgREST/Realtime channels. All writes
-- must be performed by the privileged server via API routes.
DROP POLICY IF EXISTS friend_requests_deny_client_write ON friend_requests;
CREATE POLICY friend_requests_deny_client_write ON friend_requests
  FOR ALL
  WITH CHECK (false);

DROP POLICY IF EXISTS friendships_deny_client_write ON friendships;
CREATE POLICY friendships_deny_client_write ON friendships
  FOR ALL
  WITH CHECK (false);

DROP POLICY IF EXISTS activities_deny_client_write ON activities;
CREATE POLICY activities_deny_client_write ON activities
  FOR ALL
  WITH CHECK (false);

DROP POLICY IF EXISTS user_presence_deny_client_write ON user_presence;
CREATE POLICY user_presence_deny_client_write ON user_presence
  FOR ALL
  WITH CHECK (false);
