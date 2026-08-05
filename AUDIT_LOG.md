# AUDIT_LOG.md

## Entry — Phase 2: Database Audit (Historical — from commit 753a5cb)

**Date:** 2026-07-31

**Task:** Audit every database interaction in the `you2ube` application.

**Summary:** Full schema audit completed. All queries verified against the
live database. Two non-breaking indexes added (`sessions_user_id_idx`,
`verification_tokens_user_id_idx`). No application query changes were
required — all column references, join conditions, and mutations matched
the schema exactly.

**Tables audited:** `users`, `profiles`, `sessions`, `verification_tokens`

**Testing:** All auth flows (signup, login, logout, email verification,
password reset, session management, cascade deletes) verified end-to-end.

---

## Entry — Phase 3: Code Recovery + YouTube Integration + Social Systems

**Date:** 2026-08-05

### Pre-implementation audit

**Repository status:** The GitHub repository (`main` branch, commits
`a1cf8fc` and `3b798c9`) had all source files deleted in two accidental
commits. The sandbox contained only the bare Next.js starter template with
an empty `schema.ts`. All previous work (auth system, schema, pages,
components) existed only in git history at `HEAD~3` (commit `753a5cb`).

**Recovery:** All 29 source files from the Phase 2 codebase were recovered
from git history and restored to the sandbox. The existing auth
architecture (self-hosted credentials-based auth via bcrypt + hashed
session tokens) was preserved exactly as built.

### What already existed (recovered from Phase 2)

1. **Database schema:** `users`, `profiles`, `sessions`,
   `verification_tokens` tables with proper FK cascades and indexes
2. **Auth system:** signup, login, logout, session cookies (httpOnly,
   hashed), email verification, password reset, proxy-based route
   protection
3. **API routes:** 8 auth endpoints + health check
4. **UI pages:** home, login, signup, dashboard, forgot-password,
   reset-password, verify-email
5. **Components:** auth-card, logout-button, resend-verification-button

### What was added in Phase 3

#### Database changes (new tables)

| Table | Purpose | Columns |
|---|---|---|
| `xp_ledger` | Tracks XP earned per action | id, user_id, amount, reason, reference_id, created_at |
| `watch_sessions` | YouTube watch history per user | id, user_id, video_id, video_title, channel_name, thumbnail_url, duration_seconds, watched_seconds, completed, started_at, last_watched_at |
| `achievements` | Achievement definitions | id, slug, name, description, icon, xp_reward, requirement, created_at |
| `user_achievements` | User ↔ achievement unlock records | id, user_id, achievement_id, unlocked_at |
| `search_history` | User search queries | id, user_id, query, result_count, created_at |

All new tables have:
- UUID primary keys with `defaultRandom()`
- Foreign keys to `users.id` with `ON DELETE CASCADE`
- Indexes on `user_id` columns
- Timestamps with timezone

#### API changes (new endpoints)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/youtube/search` | GET | Optional | Search YouTube via Data API v3 |
| `/api/youtube/trending` | GET | No | Get trending YouTube videos |
| `/api/youtube/video/[id]` | GET | No | Get single video details |
| `/api/watch` | POST | Required | Start/update a watch session |
| `/api/watch` | GET | Required | Get user's watch history |
| `/api/xp` | GET | Required | Get user's XP, level, and history |

#### UI changes

- **Home page:** Complete redesign with dark theme (slate-950), YouTube
  branding, hero section, feature cards grid
- **Dashboard:** Full redesign with XP/level stats, search bar, watch
  history grid, video cards with thumbnails
- **Auth pages:** Updated to dark theme with red accent colors
- **All components:** Restyled for dark mode

#### New files created

- `src/lib/youtube.ts` — YouTube Data API v3 wrapper (search, video details, trending)
- `src/lib/xp.ts` — XP system (award, calculate level, history)
- `src/app/api/youtube/search/route.ts`
- `src/app/api/youtube/trending/route.ts`
- `src/app/api/youtube/video/[id]/route.ts`
- `src/app/api/watch/route.ts`
- `src/app/api/xp/route.ts`
- `src/components/search-bar.tsx` — YouTube search with video cards
- `src/components/xp-bar.tsx` — Level progress bar
- `src/components/watch-history.tsx` — Watch session card grid

#### Files modified (from Phase 2 versions)

- `src/db/schema.ts` — Added 5 new tables (kept all Phase 2 tables unchanged)
- `src/app/layout.tsx` — Updated metadata and body bg for dark theme
- `src/app/page.tsx` — Complete redesign with YouTube branding
- `src/app/dashboard/page.tsx` — Added XP stats, search, watch history
- `src/app/login/page.tsx` — Dark theme styling
- `src/app/signup/page.tsx` — Dark theme styling
- `src/app/forgot-password/page.tsx` — Dark theme styling
- `src/app/reset-password/page.tsx` — Dark theme styling
- `src/app/verify-email/page.tsx` — Dark theme styling
- `src/components/auth-card.tsx` — Dark theme styling
- `src/components/logout-button.tsx` — Dark theme styling
- `src/components/resend-verification-button.tsx` — Dark theme styling

#### Security changes

- YouTube API key is read server-side only (`process.env.YOUTUBE_API_KEY`)
- All YouTube API calls go through server-side API routes (no client exposure)
- Watch session and XP endpoints require authentication
- Search queries are sanitized (max 200 chars)
- Video IDs are validated (max 20 chars)

#### Architecture decisions

- YouTube API integration uses the official YouTube Data API v3
- XP system uses an append-only ledger pattern (auditable, no data loss)
- Watch sessions are upserted per user+video pair (no duplicates)
- Level calculation uses a progressive formula (each level requires more XP)
- All new features gracefully degrade when `YOUTUBE_API_KEY` is not set

#### Known limitations

- No email provider configured (verification links logged to console)
- YouTube API requires a valid `YOUTUBE_API_KEY` env var to return results
- Achievement unlocking logic is defined but not yet automated (schema ready)
- No Discord integration yet (planned for future phase)
- No real-time watch progress tracking (tracks on-click only)

#### Future recommendations

- Add automated achievement checking (e.g., "watched 10 videos")
- Add YouTube iframe embed for in-app playback
- Integrate Discord OAuth for optional login
- Add user profile editing page
- Add leaderboard/social features
- Add real email provider (Resend, SendGrid, etc.)

### Testing performed

- `npx next typegen` — pass
- `npm exec tsc -- --noEmit --pretty false` — pass
- `npm run build` — pass
- `build_and_start` — pass, `/api/health` returns `{ ok: true }`
- Schema push verified against PostgreSQL

---

## Entry — Phase 4: Profile System + Supabase Storage Avatars

**Date:** 2026-08-05

### Phase completed

Implemented the complete profile system requested for the Supabase Identity
phase while preserving the existing working authentication system. This
phase intentionally does **not** replace current custom auth with Supabase
Auth because that would create a duplicate identity architecture and risk
breaking existing sessions, passwords, verification, and protected routes.
Supabase is integrated for Storage-backed avatar uploads only.

### Pre-implementation audit

Read and inspected:

- `AUDIT_LOG.md`
- `src/db/schema.ts`
- Existing auth implementation:
  - `src/lib/auth/users.ts`
  - `src/lib/auth/session.ts`
  - `src/app/api/auth/signup/route.ts`
  - existing auth routes under `src/app/api/auth/**`
- Current API routes under `src/app/api/**`
- Current components under `src/components/**`
- Current dashboard UI in `src/app/dashboard/page.tsx`
- Current package/config files
- GitHub repository clone from `https://github.com/Dragxon4000/you2ube` on branch `main`
- Existing migration files: none existed before this phase

### What already existed

- One working custom credentials auth system using `users`, `sessions`,
  `verification_tokens`, bcrypt password hashing, and httpOnly cookies.
- Automatic profile creation already existed in `createUserWithProfile()`.
- `profiles` table existed with `display_name`, `avatar_url`, timestamps,
  and one-to-one `user_id` relationship.
- Dashboard, XP, YouTube search, watch sessions, and public route
  protection were already implemented.

### What needed to change

- Expand `profiles` into a complete editable profile model.
- Add authenticated APIs for profile read/update and avatar upload/delete.
- Add Supabase Storage upload helper using server-only credentials.
- Add protected `/profile` editor UI.
- Add public `/users/[id]` profile page that honors privacy settings.
- Add migration SQL file documenting the DB additions.
- Update documentation and audit log.

### Files changed

#### Database / migrations

- `src/db/schema.ts`
  - Added profile columns: `bio`, `location`, `website_url`,
    `avatar_path`, `profile_visibility`, `show_watch_history`, `show_xp`,
    `show_achievements`.
  - Kept existing auth/session tables intact.
- `drizzle/0001_profile_system.sql`
  - Added an additive SQL migration for the new profile/privacy columns.
  - Added a DB-level `profiles_profile_visibility_check` constraint.

#### Auth/session

- `src/lib/auth/session.ts`
  - Extended `SessionUser.profile` to include all profile/privacy fields.
  - Kept cookie/session semantics unchanged.
- `src/proxy.ts`
  - Added `/profile` to protected routes.

#### Supabase Storage / validation

- `src/lib/supabase/storage.ts`
  - New server-only Supabase Storage helper.
  - Uses `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`,
    `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_KEY`, and optional
    `SUPABASE_AVATAR_BUCKET`.
  - Uploads avatars to `avatars` bucket by default.
- `src/lib/profile/validation.ts`
  - New profile update validation.
  - Validates display name, website URLs, visibility values, avatar MIME
    types, and max avatar size.

#### API routes

- `src/app/api/profile/route.ts`
  - New `GET` route returns or backfills the current user's profile.
  - New `PATCH` route validates and updates editable profile/privacy fields.
- `src/app/api/profile/avatar/route.ts`
  - New `POST` route uploads an avatar to Supabase Storage and updates
    `profiles.avatar_url` / `profiles.avatar_path`.
  - New `DELETE` route removes the avatar reference and attempts to delete
    the old object from Supabase Storage.

#### UI / React components

- `src/components/profile-form.tsx`
  - New client component for editing profile details, uploading/removing
    avatars, and managing privacy settings.
  - Includes loading, success, and error states.
- `src/app/profile/page.tsx`
  - New protected profile settings page.
- `src/app/users/[id]/page.tsx`
  - New public profile page enforcing `profile_visibility`,
    `show_watch_history`, `show_xp`, and `show_achievements`.
- `src/app/dashboard/page.tsx`
  - Added avatar/profile navigation and public profile link.

#### Documentation / dependencies

- `README.md`
  - Added architecture overview, environment variables, routes, migration
    notes, and validation commands.
- `package.json` / `package-lock.json`
  - Added `@supabase/supabase-js` via package manager.

### Database changes

`profiles` table additions:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `bio` | text | null | User profile bio |
| `location` | text | null | Optional location |
| `website_url` | text | null | Optional validated HTTP/HTTPS URL |
| `avatar_path` | text | null | Supabase Storage object path |
| `profile_visibility` | text | `public` | `public`, `friends`, or `private` |
| `show_watch_history` | boolean | `true` | Public watch-history visibility toggle |
| `show_xp` | boolean | `true` | Public XP visibility toggle |
| `show_achievements` | boolean | `true` | Public achievements visibility toggle |

Applied with:

- `npx drizzle-kit push --force`
- `psql ... -f drizzle/0001_profile_system.sql`

### API changes

New API routes:

- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/profile/avatar`
- `DELETE /api/profile/avatar`

No existing auth endpoints were removed or replaced.

### UI changes

- Added full profile editing page at `/profile`.
- Added avatar upload/remove UI with Supabase Storage-backed API.
- Added privacy settings UI.
- Added public profile page at `/users/[id]`.
- Added dashboard profile/avatar links.

### Security changes

- Supabase service role key is used only in server-only code.
- No Supabase secret is exposed to client bundles.
- Avatar uploads require authentication.
- Avatar MIME types are allowlisted: JPEG, PNG, WebP, GIF.
- Avatar size is capped at 2 MB.
- Profile updates validate display name length, visibility values, booleans,
  and website URL protocol.
- Public profile page enforces privacy settings server-side.
- Existing httpOnly session-cookie authentication remains unchanged.

### Known limitations

- Supabase Auth is not active; this phase uses Supabase Storage only to
  avoid duplicating/breaking the working auth architecture.
- `friends` privacy mode is reserved and currently behaves like private for
  non-owners because a friend graph is not implemented yet.
- Avatar uploads require a configured Supabase project and existing bucket.
- Avatar public URLs assume the avatar bucket is public; private bucket
  signed URL support can be added later.
- Achievement display is still placeholder until achievement-unlock UI is
  implemented.

### Future recommendations

- If Supabase Auth is required later, plan a deliberate migration from
  custom `users`/`sessions` to Supabase Auth instead of running both in
  parallel.
- Add friend/follow relationships so `friends` privacy mode can be enforced.
- Add signed URL support for private avatar buckets.
- Add profile search/discovery.
- Add image resizing/transformation via Supabase image transformations.
- Add automated achievement unlocking and public achievement display.

### Testing performed

- Cloned/read GitHub repo and verified branch: `main`.
- Read repository structure and confirmed no previous migrations existed.
- Applied schema changes with `npx drizzle-kit push --force`.
- Applied `drizzle/0001_profile_system.sql` with `psql`.
- `npx next typegen` — pass.
- `npm exec tsc -- --noEmit --pretty false` — pass.
- `npm run build` — pass.
- `build_and_start` — pass, `/api/health` returned `{ ok: true }`.

---

## Manual testing checklist

- [x] Sign up with a new email → account + profile created, session cookie set
- [x] Log in with correct credentials → session cookie set
- [x] Visit `/dashboard` while logged out → redirected to `/login`
- [x] Visit `/login` while logged in → redirected to `/dashboard`
- [x] Log out → session destroyed
- [x] Home page renders with YouTube branding
- [x] Dashboard shows XP stats and search bar
- [x] Search API returns empty array when no API key (graceful degradation)
- [x] Watch API requires authentication
- [x] XP API requires authentication
- [x] `/api/health` returns `{ ok: true }`
- [x] `/profile` is protected by proxy auth
- [x] `/api/profile` requires authentication
- [x] `/api/profile/avatar` requires authentication
- [x] Public profile pages respect private profile visibility

---

## Entry — Phase 5: Official YouTube Integration, Embedded Playback, and Continue Watching

**Date:** 2026-08-05

### Phase completed

Completed the production YouTube integration extension using the official
YouTube Data API v3 and YouTube IFrame Player API. This extends the prior
search/metadata implementation; it does not introduce any video downloader,
video proxy, unapproved API, or alternate playback provider.

### What already existed

- Server-side `YOUTUBE_API_KEY` integration in `src/lib/youtube.ts`.
- Official Data API search, trending, and metadata endpoints.
- `watch_sessions` database table and dashboard history cards.
- Search cards that previously opened videos externally and recorded an
  incorrect full-duration watch position on click.
- Profile system and existing custom session authentication.

### What changed

#### Database changes

- Added `watch_sessions.resume_position_seconds` (integer, default `0`).
- Added a composite unique index, `watch_sessions_user_video_unique`, over
  `(user_id, video_id)` to guarantee one durable record per account/video.
- Created `drizzle/0002_youtube_playback.sql`.
  - Adds the resume field.
  - Retains only the newest legacy row for any pre-existing duplicate
    account/video records before uniqueness is applied.
  - Creates the composite unique index.

#### API changes

- Reworked `POST /api/watch` to accept validated, actual IFrame Player
  position updates rather than a click-derived full duration.
  - Requires authentication.
  - Validates video IDs, metadata lengths, HTTPS thumbnail URLs, durations,
    positions, and completion events.
  - Stores furthest progress separately from exact resume position.
  - Marks completion only from a player completion event.
- Enhanced `GET /api/watch` with validated `limit` support.
- Updated `/api/youtube/search`.
  - Adds per-user/IP local sliding-window throttling (six searches/minute).
  - Preserves server-side Data API use and search telemetry.
  - Returns `429` and `Retry-After` when locally throttled.
  - Safely maps upstream quota/rate-limit/configuration errors.
- Updated `/api/youtube/video/[id]` and `/api/youtube/trending` with the
  same safe upstream error handling.

#### UI changes

- Added protected `/watch/[id]` route.
  - Displays official Data API metadata.
  - Uses the official YouTube IFrame Player API inside the application.
  - Saves progress every 15 seconds, on pause, on end, and on page exit.
  - Seeks to the stored resume point when opening an unfinished video.
  - Includes a direct "Open on YouTube" link and clear player loading/error
    states.
- Updated search cards to navigate to in-app playback instead of opening a
  new tab and marking a video completed.
- Updated history cards to link to `/watch/[id]`, show saved progress, and
  present explicit "Continue from …" / "Watch again" actions.
- Renamed dashboard history section to "Continue Watching".
- Protected `/watch/:path*` through the existing `proxy.ts` auth route
  protection.

#### New files

- `drizzle/0002_youtube_playback.sql`
- `src/lib/youtube-rate-limit.ts`
- `src/lib/watch-sessions.ts`
- `src/components/youtube-player.tsx`
- `src/app/watch/[id]/page.tsx`

#### Modified files

- `src/db/schema.ts`
- `src/lib/youtube.ts`
- `src/app/api/watch/route.ts`
- `src/app/api/youtube/search/route.ts`
- `src/app/api/youtube/trending/route.ts`
- `src/app/api/youtube/video/[id]/route.ts`
- `src/components/search-bar.tsx`
- `src/components/watch-history.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/users/[id]/page.tsx`
- `src/proxy.ts`
- `README.md`
- `AUDIT_LOG.md`

### API/quota controls

- The wrapper caches `search.list` results for five minutes.
- Search results call a single batched `videos.list` request for metadata.
- Individual metadata and trending calls cache for ten minutes.
- No automatic pagination/background polling is implemented.
- Search has a server-side best-effort per-user/IP sliding-window limit.
- Quota/rate-limit errors are returned as clear user-safe response payloads.
- Official Google documentation reviewed: default allocation currently notes
  100 `search.list` calls/day and 10,000 units/day for other endpoints;
  additional quota requires the official compliance audit process.

### Security and policy controls

- `YOUTUBE_API_KEY` remains server-side only.
- No video URL is downloaded, proxied, stored, or transformed.
- Playback uses the official `www.youtube.com/iframe_api` and official
  embedded player only, with a configured browser origin.
- The embedded player is shown with native YouTube controls and always has a
  direct YouTube watch-page link.
- Watch history updates require the current authenticated session.
- Payload validation limits data size and prevents invalid video IDs/URLs.

### Known limitations

- The local in-memory search limiter is process-local. Replace it with Redis
  or another shared limiter before running multiple application instances.
- An active `YOUTUBE_API_KEY` is required for live search and server-rendered
  metadata. The app provides a graceful unavailable state when absent.
- The platform cannot prove continuous human viewing; position persistence is
  based on official player state/current-time events.
- Existing historical records created by the old click flow may already have
  an overstated `watched_seconds`; new records use actual player telemetry.

### Future recommendations

- Add a shared distributed rate limiter and Google Cloud quota monitoring
  alerts before scaling traffic.
- Complete the official YouTube API compliance audit before requesting quota
  expansion.
- Add cursor pagination only after a quota-budget review.
- Add user-facing retry timing/countdown for 429 responses.
- Consider a migration that reconciles legacy click-derived watch data if
  exact historical accuracy is required.

### Testing performed

- Repository, branch `main`, documentation, migrations, schema, API routes,
  auth implementation, and current components audited before changes.
- Official YouTube IFrame Player API and Data API quota documentation read.
- `psql -f drizzle/0002_youtube_playback.sql` — pass; no legacy duplicate
  sessions existed in the local database.
- `npx drizzle-kit push --force` — pass.
- `npx next typegen` — pass.
- `npm exec tsc -- --noEmit --pretty false` — pass.
- `npm run build` — pass; includes `/watch/[id]` and all API routes.
- `build_and_start` — pass; production health check passed.
- `GET /api/health` — returned `{ ok: true }`.
- Anonymous `GET /api/watch` — correctly returned `401`.
- Anonymous `/watch/dQw4w9WgXcQ` — correctly redirected to login with a safe
  `next` parameter.
- Authenticated runtime test — created a temporary account, submitted 12s and
  then 42s playback positions for one valid YouTube ID, and confirmed one
  shared `sessionId`, `created: true` then `created: false`, and persisted
  `watchedSeconds: 42` / `resumePositionSeconds: 42`; test user was deleted.
- `\d watch_sessions` — confirmed `resume_position_seconds` and the unique
  `(user_id, video_id)` index in PostgreSQL.
- Missing `YOUTUBE_API_KEY` fallback — correctly returned a clear `503`
  `not_configured` payload without exposing any secret.

### Manual testing checklist

- [x] Unauthenticated watch API access is rejected.
- [x] Unauthenticated `/watch/[id]` access redirects to login.
- [x] Authenticated first playback progress creates one watch session.
- [x] Later progress for the same video updates that same session.
- [x] Persisted resume position is returned by `GET /api/watch`.
- [x] Database has a unique user/video watch-session constraint.
- [x] App remains buildable and starts with the production health check.
- [ ] With a configured `YOUTUBE_API_KEY`, manually verify a real search,
  embedded playback, 15-second position save, pause save, page-exit save,
  completion save, and resume seek in a browser.

---

## Entry — Phase 4: Internal Social System

**Date:** 2026-08-05

### Phase completed

Implemented an internal social system with friend requests, accept/reject,
friend removal, user presence, and a mixed activity feed. This phase keeps
the existing custom cookie-based authentication as the single identity system
and does not attempt to mirror Discord friends (Discord does not expose them).
Supabase is integrated as the optional realtime transport layer; all writes
continue to go through server-side API routes and are authorized by the
existing you2ube session cookie.

### Pre-implementation audit

Read and inspected:

- `AUDIT_LOG.md`
- `src/db/schema.ts`
- Existing auth, YouTube, watch-session, XP, and profile implementations
- Existing Supabase Storage helper (`src/lib/supabase/storage.ts`)
- Existing API routes and protected route proxy
- Existing documentation and migration files

### Architecture decisions

- **Identity remains unchanged.** This phase adds only social features and
  social storage; it does not add Supabase Auth or any second auth system.
- **Server writes are authoritative.** Every friend/request/presence/feed
  mutation is performed by server API routes using Drizzle and the existing
  `getSessionUser()` helper.
- **RLS is applied for defense in depth.** All four new social tables have
  RLS enabled and `WITH CHECK (false)` policies that deny direct client
  writes through PostgREST/Realtime. Read-level policies that depend on
  Supabase Auth `auth.uid()` are not applied in this non-Supabase Postgres
  sandbox (no `auth` schema exists); they are documented in the migration
  comments for later when the database is attached to a Supabase project.
- **Realtime is optional.** The UI polls every 30 seconds and sends
  heartbeats even when Supabase Realtime is not configured. When a Supabase
  project URL + anon key are available, the browser client helper in
  `src/lib/supabase/client.ts` can subscribe to changes.
- **No Discord integration.** Friend relationships are entirely internal.
- **Activity feed is denormalized** through append-only `activities` rows.

### Database changes

New tables:

| Table | Purpose |
|---|---|
| `friend_requests` | One-way friend requests with `pending`, `accepted`, `rejected`, `cancelled` statuses. |
| `friendships` | Symmetric friend edges stored as two directed rows with a direction-insensitive unique index over `(LEAST(user_id, friend_id), GREATEST(...))`. |
| `activities` | Append-only activity log for watch events and friend adds. |
| `user_presence` | One row per user with online/away/offline status and optional current video. |

Constraints/indexes:

- Unique pending-request index per unordered pair.
- No-self-request and no-self-friend constraints.
- Indexes on foreign keys, statuses, and timestamps.
- RLS enabled on all four tables with blanket write-deny policies for
  direct PostgREST/Realtime writes.
- Migration files:
  - `drizzle/0003_social_system.sql`
  - `drizzle/0004_social_rls_policies.sql`

### API changes

New authenticated endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/social/friends` | GET | Friends list + incoming/outgoing pending requests. |
| `/api/social/friends?friendId=...` | DELETE | Removes a friend (deletes both edges). |
| `/api/social/requests` | POST | Sends a friend request (auto-accepts reciprocal pending). |
| `/api/social/requests/[id]/accept` | POST | Accepts an incoming request. |
| `/api/social/requests/[id]/reject` | POST | Rejects an incoming request. |
| `/api/social/requests/[id]/cancel` | POST | Cancels an outgoing request. |
| `/api/social/presence` | GET/POST/PATCH | Presence read, online status update, heartbeat. |
| `/api/social/feed` | GET | Combined friends + own activity feed. |
| `/api/social/users/search` | GET | Lookup users by email (exact) or display name. |

### UI changes

- Added protected `/social` page with tabs:
  - **Friends**: add friend by email/display name, friends list with remove,
    presence dots.
  - **Requests**: incoming (accept/reject) and outgoing (cancel) with unread
    badge.
  - **Feed**: activity cards with relative timestamps.
  - **Online**: friends currently seen as online/away.
- Added a "Social" nav link on the dashboard.
- `/social` is protected by the existing `proxy.ts`.

### Files added/modified

Added:

- `src/lib/social.ts`
- `src/lib/supabase/client.ts`
- `src/app/api/social/friends/route.ts`
- `src/app/api/social/requests/route.ts`
- `src/app/api/social/requests/[id]/accept/route.ts`
- `src/app/api/social/requests/[id]/reject/route.ts`
- `src/app/api/social/requests/[id]/cancel/route.ts`
- `src/app/api/social/presence/route.ts`
- `src/app/api/social/feed/route.ts`
- `src/app/api/social/users/search/route.ts`
- `src/app/social/page.tsx`
- `src/components/social-dashboard.tsx`
- `drizzle/0003_social_system.sql`
- `drizzle/0004_social_rls_policies.sql`

Modified:

- `src/db/schema.ts` — added social tables and indexes.
- `src/proxy.ts` — added `/social/:path*` protection.
- `src/app/dashboard/page.tsx` — added Social nav link.
- `src/lib/watch-sessions.ts` — writes watch activity rows.
- `AUDIT_LOG.md` — this entry.

### Security changes

- All social endpoints require authentication.
- UUID validation on all request/friend/user IDs.
- Self-friend/self-request rejected.
- Database-level unique constraints prevent duplicate friendships/pending requests.
- Reciprocal pending requests auto-accept without duplicating edges.
- RLS enabled on social tables; direct client writes are denied.
- Presence status and current-video values are validated.
- User search by email normalizes via existing validation helpers.

### Known limitations

- RLS read policies tied to Supabase Auth are not applied in this plain-Postgres
  sandbox (no `auth` schema); server API routes enforce authorization.
- Supabase Realtime channel subscriptions are available client-side but only
  activate when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  are configured; UI falls back to polling.
- No pagination on feed or friends list yet.
- Achievement/level-up activities are defined in the schema but the events are
  not yet emitted.

### Testing performed

- Applied both SQL migrations against the live Postgres instance.
- Ran `npx drizzle-kit push --force`.
- Verified all 13 tables exist including the four new social tables.
- `npx next typegen` — pass.
- `npm exec tsc -- --noEmit --pretty false` — pass.
- `npm run build` — pass; all 26 routes compiled.
