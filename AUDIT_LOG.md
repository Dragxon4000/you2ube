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
