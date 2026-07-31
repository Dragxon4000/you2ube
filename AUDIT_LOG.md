# AUDIT_LOG.md

## Entry — Phase 2: Database Audit

**Date:** 2026-07-31

**Task:** Audit every database interaction in the `you2ube` application
(tables, columns, relationships, foreign keys, constraints, indexes,
triggers, functions, policies, RLS, queries, joins) and replace only the
application queries that are incorrect, without redesigning the schema
unless absolutely necessary.

---

### Repository status at the start of this task

- The sandbox workspace (`/app`) contained only the generic, unbranded
  Next.js + Drizzle + PostgreSQL starter template — no auth system, no
  `you2ube`-specific code, and an empty `schema.ts` (`export {}`).
- `CLAUDE.md` did not exist locally.
- Per `CLAUDE.md`'s own instruction ("clone/download the latest version of
  this repository ... use it as the single source of truth"), the GitHub
  repository at `https://github.com/Dragxon4000/you2ube` was cloned fresh.
  Unlike the stale finding recorded in the repo's own `AUDIT.md` (which
  claimed the GitHub repo only contained a `README.md`), the current `main`
  branch (commit `9c6c9c5`, "yup") contains a complete self-hosted
  credentials-based authentication system built on Next.js 16 + Drizzle +
  PostgreSQL: signup, login, logout, session cookies, email verification,
  password reset, a protected `/dashboard` route via `proxy.ts`
  (Next.js 16's replacement for `middleware.ts`), and a `users` /
  `profiles` / `sessions` / `verification_tokens` schema.
- That repository content was copied into this sandbox as the working
  codebase (all of `src/app/**`, `src/components/**`, `src/lib/auth/**`,
  `src/db/schema.ts`, `src/proxy.ts`), and the two missing runtime
  dependencies it requires (`bcryptjs`, `server-only`) were installed via
  the package manager.

---

### 1. Schema inventory (`src/db/schema.ts`, verified live in Postgres via `\d`)

| Table | Columns | PK | Unique | FK | Notes |
|---|---|---|---|---|---|
| `users` | id (uuid), email (text), password_hash (text), email_verified (bool, default false), created_at, updated_at | id | email | — | Root identity table |
| `profiles` | id (uuid), user_id (uuid), display_name (text), avatar_url (text, nullable), created_at, updated_at | id | user_id (1:1) | user_id → users.id ON DELETE CASCADE | One profile per user |
| `sessions` | id (text = sha256(token)), user_id (uuid), expires_at, created_at | id | — | user_id → users.id ON DELETE CASCADE | Opaque, hashed session tokens |
| `verification_tokens` | id (uuid), user_id (uuid), token_hash (text), type (text: `email_verification` \| `password_reset`), expires_at, used_at (nullable), created_at | id | token_hash | user_id → users.id ON DELETE CASCADE | Shared table for email-verify + password-reset flows |

Confirmed via `psql \d` against the running database that the live schema
(columns, types, defaults, PK/unique constraints, FK cascade rules) matches
`schema.ts` exactly after `npx drizzle-kit push`.

**RLS / Policies:** Not applicable. This is a plain `pg`/Drizzle connection
with a single trusted server-side role (`postgres`), not Supabase — there is
no `auth.users`/`public.profiles` Supabase pattern and no RLS is enabled
anywhere. All authorization happens in application code (`proxy.ts`,
`getSessionUser()`), which is correct for this architecture and was left
unchanged (no Supabase Auth exists, so CLAUDE.md's "reuse Supabase Auth"
branch does not apply — this repo has exactly one, non-conflicting,
self-hosted auth architecture).

**Triggers / Functions:** None defined, and none needed — `updated_at`
maintenance and expiry checks are handled explicitly in application code
(`set({ updatedAt: new Date() })` on every mutating update), so there is no
missing trigger causing incorrect behavior.

### 2. Query-by-query audit (all files under `src/lib/auth/**` and `src/app/api/auth/**`)

| File | Query | Verified against schema |
|---|---|---|
| `lib/auth/users.ts` | `INSERT INTO users (email, password_hash) ... RETURNING *` then `INSERT INTO profiles (user_id, display_name)` inside one `db.transaction` | ✅ Columns match; correctly atomic (profile can never exist without a user) |
| `lib/auth/session.ts` | `INSERT INTO sessions (id, user_id, expires_at)` | ✅ |
| `lib/auth/session.ts` | `SELECT ... FROM sessions INNER JOIN users ON sessions.user_id = users.id LEFT JOIN profiles ON profiles.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > now()` | ✅ Join keys and columns correct; `LEFT JOIN` on profiles is correct since a session must always have a user but a profile is conceptually optional at the type level |
| `lib/auth/session.ts` | `DELETE FROM sessions WHERE id = ?` | ✅ |
| `lib/auth/tokens.ts` | `INSERT INTO verification_tokens (user_id, token_hash, type, expires_at)` | ✅ |
| `lib/auth/tokens.ts` | `SELECT * FROM verification_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > now()` then `UPDATE ... SET used_at = now() WHERE id = ?` | ✅ Correct one-time-use + expiry semantics |
| `lib/auth/tokens.ts` | `SELECT * FROM users WHERE email = ?` | ✅ |
| `api/auth/signup/route.ts` | `SELECT * FROM users WHERE email = ?` (pre-check) → `createUserWithProfile` → `createEmailVerificationToken` → `createSession` | ✅ All columns match; verified end-to-end at runtime (see Testing below) |
| `api/auth/login/route.ts` | `SELECT * FROM users WHERE email = ?` + bcrypt compare | ✅ |
| `api/auth/logout/route.ts` | delegates to `destroySession()` | ✅ |
| `api/auth/me/route.ts` | delegates to `getSessionUser()` | ✅ |
| `api/auth/reset-password/route.ts` | `consumeVerificationToken(token, "password_reset")` → `UPDATE users SET password_hash, updated_at WHERE id = ?` → `DELETE FROM sessions WHERE user_id = ?` | ✅ Correctly invalidates all sessions after a password reset |
| `api/auth/verify-email/route.ts` | `consumeVerificationToken(token, "email_verification")` → `UPDATE users SET email_verified = true, updated_at WHERE id = ?` | ✅ |
| `api/auth/resend-verification/route.ts` | `createEmailVerificationToken` | ✅ |
| `api/auth/forgot-password/route.ts` | `getUserByEmail` → `createPasswordResetToken` | ✅ |
| `proxy.ts` (route protection) | `getUserByToken(token)` (same join as above) | ✅ |

**Result: no incorrect queries were found.** Every column reference, join
condition, `WHERE` clause, and mutation in the application code matches a
real column/table in `schema.ts` and in the live database. No application
query changes were required.

### 3. Gap found and fixed (index-only, non-breaking)

- `sessions.user_id` and `verification_tokens.user_id` are queried (`DELETE
  ... WHERE user_id = ?`, joins) but had no index — only their primary keys
  and the unrelated unique columns (`token_hash`) were indexed. This does
  not cause incorrect results, only unnecessary sequential scans as the
  tables grow.
- **Fix:** added `index("sessions_user_id_idx")` and
  `index("verification_tokens_user_id_idx")` to `src/db/schema.ts` and
  applied with `npx drizzle-kit push`. This is additive only — no table
  was dropped/renamed, no column type changed, no relationship altered.
  Verified live via `psql \d sessions` / `\d verification_tokens`.

### 4. Runtime testing performed (against the live Postgres instance)

All flows were exercised end-to-end with `curl` + `psql` against the
running production build:

1. `POST /api/auth/signup` → row created in `users` and matching row in
   `profiles` (transaction verified atomic).
2. `GET /api/auth/me` with the session cookie → correct `INNER/LEFT JOIN`
   result returned.
3. `POST /api/auth/logout` → session row deleted; `me` returns `null`.
4. `POST /api/auth/login` (correct password) → new session row created.
5. Email verification: inserted a token, called
   `POST /api/auth/verify-email` → `users.email_verified` flips to `true`,
   `verification_tokens.used_at` is set, and replaying the same token is
   correctly rejected.
6. Password reset: `POST /api/auth/forgot-password` → inserted a
   `password_reset` token → `POST /api/auth/reset-password` → password
   hash updated, **all sessions for that user deleted** (confirmed count
   went from 1 to 0), old password rejected on next login, new password
   accepted.
7. Duplicate signup with the same email correctly returns `409`.
8. `DELETE FROM users` for the test user correctly cascades and removes
   all of that user's rows in `profiles`, `sessions`, and
   `verification_tokens` (confirmed all three counts went from
   non-zero to `0`), proving the `ON DELETE CASCADE` foreign keys work
   exactly as declared.

### Files inspected

- `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.json`, `.env`
- `src/lib/auth/crypto.ts`, `session.ts`, `tokens.ts`, `users.ts`, `validation.ts`
- `src/app/api/auth/{signup,login,logout,me,forgot-password,reset-password,verify-email,resend-verification}/route.ts`
- `src/app/api/health/route.ts`
- `src/proxy.ts`
- `src/app/{page,layout,dashboard/page,login/page,signup/page,forgot-password/page,reset-password/page,verify-email/page}.tsx`
- `src/components/{auth-card,logout-button,resend-verification-button}.tsx`
- Live database structure via `psql \dt`, `\d users`, `\d profiles`,
  `\d sessions`, `\d verification_tokens`

### Files modified

- `src/db/schema.ts` — added two non-breaking indexes
  (`sessions_user_id_idx`, `verification_tokens_user_id_idx`). No other
  schema change.
- `package.json` (via `install_npm_packages`) — added `bcryptjs` and
  `server-only`, both of which the existing repository code already
  imports but which were missing from the sandbox's dependency list.
- No application query files were modified — the audit found none to be
  incorrect.

### Architecture decisions

- Kept the existing single self-hosted credentials-auth architecture
  as-is (no Supabase, no NextAuth, no second auth system introduced),
  per CLAUDE.md's authentication rules.
- Declined to add DB-level `CHECK` constraints or a native Postgres enum
  for `verification_tokens.type` (currently enforced only at the
  TypeScript/Drizzle level). This is a hardening opportunity, not a bug —
  every code path that writes to that column already only ever writes one
  of the two literal values — so it was left alone to honor "do not
  redesign the schema unless absolutely necessary."

### Testing completed

- `npx next typegen` — pass
- `npm exec tsc --noEmit` — pass, zero errors
- `npm run build` — pass, all 16 routes compiled (10 API routes, 6 pages)
- `build_and_start` — pass, `/api/health` returns `{ ok: true }`
- Manual end-to-end database flow testing (see section 4 above) — all
  passed against the live PostgreSQL instance

### Remaining issues / TODOs

- No real email provider is configured (verification/reset links are
  logged to the server console only). This is a product/infra decision
  already documented in `lib/auth/tokens.ts` and out of scope for a
  database audit.
- `verification_tokens.type` is not backed by a native Postgres enum or
  `CHECK` constraint — flagged above as a possible future hardening step,
  not fixed now per the "no schema redesign" constraint.

---

## Manual testing checklist

- [x] Sign up with a new email → account + profile created, session cookie set
- [x] Sign up again with the same email → `409 Conflict`
- [x] Log in with correct credentials → session cookie set, `/api/auth/me` returns the user
- [x] Log in with wrong password → `401`
- [x] Visit `/dashboard` while logged out → redirected to `/login?next=/dashboard`
- [x] Visit `/login` or `/signup` while logged in → redirected to `/dashboard`
- [x] Log out → session destroyed, `/api/auth/me` returns `null`
- [x] Request a password reset, use the emailed (logged) token → password changes and all existing sessions are invalidated
- [x] Reuse a consumed/expired token → rejected with a clear error
- [x] Verify email with a valid token → `users.email_verified` becomes `true`; reusing the token fails
- [x] Delete a user directly in Postgres → cascades correctly to `profiles`, `sessions`, `verification_tokens`
