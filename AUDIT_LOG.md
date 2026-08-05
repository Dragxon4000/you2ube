# AUDIT_LOG

A running record of meaningful changes to the you2ube codebase.

---

## Phase 6 Audit & Fixes (Post-Implementation)

**Date:** 2026
**Scope:** Full audit of Phase 6 progression system before Phase 7.

### Audit Findings & Resolutions

| Severity | Issue | Resolution |
|---|---|---|
| 🔴 CRITICAL | **Database empty** — tables were never created; `drizzle-kit push` was never run. All API calls would fail in production. | Ran `npx drizzle-kit push` to create all 15 tables. Verified with `information_schema.tables` query. |
| 🔴 CRITICAL | **No authentication** — every API route hardcoded `username: "you"`, making the system anonymous and allowing any request to manipulate the demo user's progression state. | Created `src/lib/session.ts` with cookie-based session abstraction. Each browser gets a stable session ID stored in an httpOnly cookie, mapping to a unique user row. All API routes now use `getCurrentUser()` from this module. Phase 7 (or future auth) can replace this module without touching API routes. |
| 🟡 HIGH | **No transaction wrapper** in `awardXp` — 5+ separate writes (xp_transactions, users update, notifications, user_achievements, user_badges, user_rewards) could leave DB inconsistent on partial failure. | Wrapped entire `awardXp` and `claimReward` functions in `db.transaction(async (tx) => { ... })`. All writes now use the transaction client `tx` instead of `db`. |
| 🟡 HIGH | **Race condition** — read-then-write pattern for XP increment (read user.xp, then write user.xp + delta) could lose updates under concurrent requests. | Changed to atomic SQL update: `UPDATE users SET xp = xp + ${delta}` using Drizzle's `sql` template. No more read-then-write. |
| 🟡 HIGH | **Seed runs on every request** — `seedProgressionSystem()` executed 5 COUNT queries on every API call with no memoization. | Added process-level memoization: `seedMemo` promise is cached and reused. Cleared only on server restart or seed failure. |
| 🟡 HIGH | **Reward notification spam** — every XP award re-checked rewards and sent "new reward available" notifications for all unlocked-but-unclaimed rewards, spamming users. | `evaluateRewards` now checks existing notifications table before sending. Only sends notification the FIRST time a reward becomes available (by checking if a notification with that `rewardId` already exists). |
| 🟡 MEDIUM | **Weak input validation** — `videoId`, `attendeeCount`, `inviteeUsername` had minimal validation. | Added comprehensive validation: `videoId` must be integer 1–1M; `attendeeCount` must be integer 0–50; `inviteeUsername` must match `/^[a-zA-Z0-9_-]{2,30}$/`; party title max 100 chars; reward ID validated; notification ID ownership checked (IDOR prevention). |
| 🟡 MEDIUM | **`unlockedAt` preservation bug** — `evaluateAchievements` used `prev?.unlockedAt ?? new Date()` which would overwrite existing unlock timestamps on every evaluation. | Fixed to preserve original `unlockedAt`: if `wasUnlocked` is true, use `prev!.unlockedAt`; only set to `new Date()` on first unlock. |
| 🟢 LOW | **Dead code** in leaderboard route — unused `rankResult` variable and placeholder code. | Removed dead code. Leaderboard route now cleanly computes rank via subquery. |
| 🟢 LOW | **Notification type mismatch** — both "new reward available" and "reward claimed" used `type: "reward"`. | Changed "new reward available" to `type: "reward_available"` to distinguish from "reward claimed" (`type: "reward"`). Updated `NotificationsPanel.tsx` color map to include `reward_available`. |

### Files Modified During Audit

- `src/db/seed.ts` — added process-level memoization.
- `src/lib/session.ts` — **new file** — cookie-based session abstraction with auto-user creation.
- `src/lib/progression.ts` — wrapped in transactions, fixed race conditions, fixed `unlockedAt` preservation, fixed reward notification spam, removed unused `PgTransaction` import.
- All API routes under `src/app/api/...` — replaced hardcoded `username: "you"` with `getCurrentUser()`, added comprehensive input validation, added IDOR checks, added proper error handling for missing auth.
- `src/components/NotificationsPanel.tsx` — added `reward_available` to color map.

### Database State

All 15 tables verified present in PostgreSQL via `information_schema.tables`:
`achievements`, `badges`, `friend_invites`, `levels`, `notifications`, `rewards`, `user_achievements`, `user_badges`, `user_rewards`, `users`, `videos`, `watch_parties`, `watch_sessions`, `xp_rules`, `xp_transactions`.

### Security Posture (Post-Audit)

- ✅ **Authentication**: Cookie-based session with httpOnly, sameSite=lax, secure in production.
- ✅ **Authorization**: All API routes scoped to current user; IDOR prevented on notifications.
- ✅ **Input validation**: All endpoints validate and sanitize inputs.
- ✅ **Transaction safety**: All multi-write operations wrapped in transactions.
- ✅ **Race condition safety**: Atomic SQL updates for counters.
- ✅ **No SQL injection**: Drizzle ORM parameterizes all queries.
- ✅ **Notification spam prevention**: Reward notifications only sent once per reward.

### Architecture for Phase 7

The session abstraction in `src/lib/session.ts` is designed to be easily replaced:
- All API routes depend only on `getCurrentUser()` which returns a `SessionUser` object.
- Phase 7 (real auth, OAuth, JWT, etc.) can replace the session module without touching any API routes or UI components.
- The `SessionUser` interface is stable and includes all fields needed by the progression system.

---

## Phase 6 — Progression System (Original Implementation)

**Date:** 2026
**Scope:** Database-driven XP, levels, achievements, badges, rewards, and notifications.

### Database (`src/db/schema.ts`)

Added the following tables (all Postgres, managed via Drizzle ORM):

| Table | Purpose |
|---|---|
| `users` | Player accounts with `xp`, `level`, and cumulative counters (`totalVideosWatched`, `totalPartiesHosted`, `totalFriendsInvited`). |
| `levels` | 25-level progression ladder. Database-driven: each row has `min_xp`, `title`, `perk`, and `color_hex`. |
| `xp_rules` | Configurable XP payouts per action (`watch_video`, `host_party`, `invite_friend`, `daily_login`). Database-driven and toggleable. |
| `xp_transactions` | Append-only ledger of every XP grant, with `reason`, `reference_type`, and `reference_id` for auditability. |
| `videos` | Demo video catalog. Each `watch_video` action references one. |
| `watch_sessions` | Tracks individual views. Used to rate-limit XP to once per video per 24h. |
| `watch_parties` | Parties hosted by users. Each party grants base XP + per-attendee bonus. |
| `friend_invites` | Invite records; grant XP on acceptance. |
| `achievements` | Definitions: `code`, `requirement_type`, `requirement_value`, `xp_reward`, `tier`. 17 seeded achievements. |
| `user_achievements` | Per-user progress + unlocked flag for every achievement. |
| `badges` | Definitions with `tier` (`common` / `rare` / `epic` / `legendary`). 8 seeded badges. |
| `user_badges` | One row per awarded badge. |
| `rewards` | Level-gated rewards (`cosmetic` / `currency` / `feature`). 7 seeded rewards. |
| `user_rewards` | Claim log. |
| `notifications` | Polymorphic in-app notifications (`level_up`, `achievement`, `badge`, `reward`, `xp`, `system`). |

### Seed data (`src/db/seed.ts`)

Idempotent seed function `seedProgressionSystem()`:

- 25 levels with exponential XP curve (100 → ~1.2M).
- 4 XP rules: `watch_video` (+25), `host_party` (+75 + 10/attendee), `invite_friend` (+50), `daily_login` (+10).
- 17 achievements across `watching`, `social`, and `progression` categories, spanning bronze → diamond tiers.
- 8 badges (newbie, cinephile, vip, legend, mythic, host_hero, social_star, binge_king).
- 7 rewards (avatar frames, emoji packs, coins, party themes, custom banners) gated on levels 3 / 5 / 7 / 10 / 15 / 18 / 20.
- 4 demo users (`you`, `alice`, `bob`, `cara`) for leaderboard display.
- 8 demo videos for the watch action.
- Welcome notification for the current user.

### Progression engine (`src/lib/progression.ts`)

Core service — pure functions that operate against the DB:

- `getLevelForXp(xp)` — resolves a level from the `levels` table.
- `getXpProgress(xp, level)` — computes progress toward the next level.
- `awardXp({ userId, action, bonusFlat, ... })`:
  1. Looks up base XP from `xp_rules`.
  2. Applies level-based bonus multiplier parsed from the level's `perk` text (e.g. "Earn 20% bonus XP" → 1.2x).
  3. Inserts an `xp_transactions` row.
  4. Increments user XP and the relevant counter.
  5. Recomputes level; emits a `level_up` notification and applies the new `level` if raised.
  6. Evaluates all achievements — upserts progress rows and grants XP bonuses on unlock.
  7. Evaluates badges — awards any newly qualified badges.
  8. Emits notifications for newly available rewards (not auto-claimed — user must opt in).
- `claimReward(userId, rewardId)` — validates level, claims, and notifies.

Recursion is avoided: achievement-granted XP is inserted into `xp_transactions` but does not re-trigger achievement evaluation.

### API routes (`src/app/api/...`)

All routes call `seedProgressionSystem()` first so cold starts auto-populate the database.

- `GET /api/profile` — full profile card payload: user, level info, XP progress, owned badges, claimed rewards, achievement counts, recent XP transactions, unread notification count.
- `GET /api/achievements` — all achievements with per-user progress, grouped by category.
- `GET /api/badges` — all badges with `owned` / `awardedAt` status.
- `GET /api/rewards` — all rewards with `unlocked` (by level) and `claimed` flags.
- `POST /api/rewards/[id]/claim` — claim a reward.
- `GET /api/notifications` — latest 50 notifications for the user.
- `POST /api/notifications` — mark a single notification or all as read.
- `GET /api/videos` — demo video feed.
- `GET /api/leaderboard` — top 20 users by XP with rank + level titles.
- **Action routes (the XP triggers):**
  - `POST /api/actions/watch` — watch a video; awards 25 XP once per video per 24h.
  - `POST /api/actions/host-party` — host a party; awards 75 XP + 10 per attendee.
  - `POST /api/actions/invite-friend` — invite a friend; awards 50 XP (demo auto-accepts).

### UI (`src/app/page.tsx`, `src/components/*`)

Single-page dashboard with tabbed navigation:

- **Profile** — large profile card with animated level color, XP progress bar, stats grid, perk display, badge preview, and achievement counter.
- **Profile → Actions** — live XP-earning actions:
  - Watch videos (grid of 8 demo videos; rate-limited once per day).
  - Host watch party (form with title + attendee slider).
  - Invite friend (form with username input).
  - Success toast shows XP gained, level-ups, newly unlocked achievements, and newly awarded badges in real time.
- **Achievements** — filterable list (all / unlocked / locked / per category) with per-achievement progress bars, tier badges (bronze / silver / gold / diamond), and XP rewards.
- **Badges** — owned vs locked grids with tier-gradient styling.
- **Rewards** — three sections (ready to claim / claimed / locked), with inline claim buttons that trigger `POST /api/rewards/[id]/claim`.
- **Leaderboard** — top users with rank icons, level-colored avatars, and "YOU" marker for the current user.
- **Notifications** — live feed with type-colored gradient icons; click to mark read, "Mark all as read" bulk action.

### Drizzle client (`src/db/index.ts`)

Wired the schema into `drizzle(pool, { schema })` so relational query API and type inference work correctly across the app.

### Design principles

- **Database-driven everything.** XP amounts, level thresholds, achievements, badges, rewards, and perks all live in tables. Changing the progression balance requires zero code changes — just SQL.
- **Auditability.** Every XP change is logged to `xp_transactions` with reason + reference, so progression can be debugged or reversed.
- **Idempotent seeding.** `seedProgressionSystem()` is safe to call on every request; uses `count(*)` checks and `onConflictDoNothing`.
- **Recursion-safe XP.** Achievement bonus XP is recorded but does not re-run achievement evaluation.
- **Rate limits where they matter.** Watch-XP is limited to once per video per 24h to prevent farming.
- **Opt-in reward claims.** Rewards unlock at a level but require explicit claim, so users don't lose rewards they haven't noticed.

### Files added / changed

- `src/db/schema.ts` — new (15 tables).
- `src/db/seed.ts` — new.
- `src/db/index.ts` — schema wired into drizzle client.
- `src/lib/progression.ts` — new (core engine).
- `src/app/api/profile/route.ts` — new.
- `src/app/api/actions/watch/route.ts` — new.
- `src/app/api/actions/host-party/route.ts` — new.
- `src/app/api/actions/invite-friend/route.ts` — new.
- `src/app/api/achievements/route.ts` — new.
- `src/app/api/badges/route.ts` — new.
- `src/app/api/rewards/route.ts` — new.
- `src/app/api/rewards/[id]/claim/route.ts` — new.
- `src/app/api/notifications/route.ts` — new.
- `src/app/api/videos/route.ts` — new.
- `src/app/api/leaderboard/route.ts` — new.
- `src/components/ProfileCard.tsx` — new.
- `src/components/ActionsPanel.tsx` — new.
- `src/components/BadgesPanel.tsx` — new.
- `src/components/AchievementsPanel.tsx` — new.
- `src/components/RewardsPanel.tsx` — new.
- `src/components/NotificationsPanel.tsx` — new.
- `src/components/LeaderboardPanel.tsx` — new.
- `src/app/page.tsx` — rewritten as tabbed dashboard.
- `src/app/layout.tsx` — updated metadata.
