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
- Final `build_and_start` validation pending below in the active turn.

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
