# Phase 0 — Complete Repository Audit

**Scope note (read first):** The task asked to audit the repository per the
instructions in `CLAUDE.md` and referenced the GitHub project
`https://github.com/Dragxon4000/you2ube`. Both were checked and neither
contains the application described by the audit checklist (Supabase config,
migrations, middleware, auth, server actions, components, hooks, etc.). This
document reports that finding first, then audits the actual code that exists
in this sandbox (a Next.js + Drizzle + PostgreSQL starter template), which is
the only real codebase available to review.

---

## 0. Pre-audit findings about the requested sources

| Source | Finding |
|---|---|
| `CLAUDE.md` | **Does not exist** anywhere in this sandbox project or in the `you2ube` repo. There are no instructions to "follow." |
| `github.com/Dragxon4000/you2ube` | Cloned and inspected directly. The repository contains **exactly one commit** ("Initial commit") and **one file**: `README.md` with the single line `# you2ube`. There is no `src/`, no `package.json`, no Supabase project, no Drizzle config, no migrations, no middleware, no auth, no API routes, no components — the repository is an empty project shell. |
| This sandbox (`/app`) | Contains a generic, unbranded **Next.js + Drizzle + PostgreSQL starter template** (`nextjs-postgresql-template`), unrelated to "you2ube" beyond being the workspace this task runs in. This is the only real code available, so the remainder of this audit covers it. |

**Conclusion:** There is no "you2ube" application to audit. What follows is a
full audit of the starter template actually present in the sandbox, so the
findings below are honest about what exists versus what is missing.

---

## 1. Architecture Overview

- **Framework:** Next.js 16.2.6 (App Router, React 19.2.6), TypeScript, strict mode.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss`, imported once in `src/app/globals.css`.
- **Database:** PostgreSQL accessed through `pg` (`node-postgres`) driver, wrapped by Drizzle ORM (`drizzle-orm/node-postgres`).
- **Schema management:** Drizzle Kit (`drizzle-kit`) configured via `drizzle.config.json`, pointing at `./src/db/schema.ts`, pushed directly to Postgres with `drizzle-kit push` (no migration files are generated or checked in).
- **App type:** Server-rendered only. No client components, no client-side state, no forms, no auth, no external services wired up.
- **Runtime surface:** Exactly two routes exist — the root page (`/`) and a health-check API route (`/api/health`).
- There is **no Supabase integration** anywhere (no `@supabase/*` packages, no supabase config directory, no `SUPABASE_*` env vars). Despite the audit checklist asking to "read the Supabase configuration," none exists.
- There is **no authentication system** (no middleware, no session/cookie handling, no auth provider, no login/signup routes).
- There are **no server actions**, no mutating API routes, and no forms.

## 2. Folder Structure Overview

```
/app (project root)
├── .env                        # DATABASE_URL only
├── drizzle.config.json         # Drizzle Kit config (postgresql dialect)
├── eslint.config.mjs           # Flat ESLint config, extends eslint-config-next/core-web-vitals
├── next.config.ts              # Empty/default Next.js config object
├── postcss.config.mjs          # Tailwind v4 PostCSS plugin only
├── tsconfig.json               # Strict TS config, "@/*" -> "./src/*" path alias
├── package.json / package-lock.json
└── src/
    ├── app/
    │   ├── layout.tsx          # Root HTML layout, static metadata
    │   ├── page.tsx            # Server component home page; runs `select 1`
    │   ├── globals.css         # Single `@import "tailwindcss"`
    │   └── api/
    │       └── health/
    │           └── route.ts    # GET handler, DB ping, JSON {ok:boolean}
    └── db/
        ├── index.ts            # Drizzle client + pg Pool singleton
        └── schema.ts           # Empty placeholder (`export {}`), no tables defined
```

No other directories exist: no `components/`, `hooks/`, `lib/`, `utils/`,
`server/`, `actions/`, `middleware.ts`, `supabase/`, or `migrations/`
directory anywhere in the tree.

## 3. Authentication Flow

**None implemented.** There is:
- No `middleware.ts` at the project root or in `src/`.
- No auth library dependency (no NextAuth/Auth.js, no `@supabase/auth-helpers` or `@supabase/ssr`, no Clerk/Lucia/etc.) in `package.json`.
- No session cookies, JWT handling, or password/credential logic anywhere.
- No protected routes — the two existing routes (`/` and `/api/health`) are fully public and read-only.

## 4. Database Flow

1. `.env` defines `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db`.
2. `src/db/index.ts`:
   - Reads `process.env.DATABASE_URL`, throws at import time if missing.
   - Creates a `pg.Pool`, cached on `globalThis` in non-production to avoid connection-pool duplication under Next.js hot reload (standard pattern).
   - Wraps the pool with `drizzle(pool)` and exports `db`.
3. `src/db/schema.ts` is an **empty placeholder** — `export {}` only, with a comment stating it exists so `drizzle-kit push` can run before any real tables are defined. **No tables, enums, or relations are defined anywhere.**
4. `drizzle.config.json` points Drizzle Kit at that empty schema file and at the same hardcoded local Postgres URL (duplicated from `.env` rather than reading it, though the value matches today).
5. Runtime DB usage is limited to raw `select 1` sanity checks in:
   - `src/app/page.tsx` (home page, server component, `dynamic = "force-dynamic"`).
   - `src/app/api/health/route.ts` (health check API, also `force-dynamic`).
   No CRUD, no ORM queries against real tables (none exist), no transactions.

## 5. Request Flow

- **`GET /`** → `src/app/page.tsx` server component executes → runs `db.execute(sql\`select 1\`)` → renders a static "Starter template" card. Marked `force-dynamic`, so it is never statically optimized/cached.
- **`GET /api/health`** → `src/app/api/health/route.ts` → runs the same `select 1` probe → returns `{ ok: true }` (200) or `{ ok: false }` (500) on failure. Also `force-dynamic`.
- No other routes, no dynamic segments, no route groups, no parallel/intercepting routes, no server actions, no client-side fetch calls.

## 6. Rendering Flow

- Pure **Server-Side Rendering** via the App Router; there are zero `"use client"` components in the codebase.
- `RootLayout` (`src/app/layout.tsx`) sets static `<html>`/`<body>` shell and page `metadata` (title/description reference the generic starter, not "you2ube").
- Tailwind utility classes are used inline in JSX; no CSS Modules, no styled-components, no design tokens beyond Tailwind defaults.
- No streaming/suspense boundaries, no loading.tsx/error.tsx/not-found.tsx files defined at any route segment.

## 7. Dependency Graph

**Production dependencies**
- `next` 16.2.6 — framework/runtime
- `react` / `react-dom` 19.2.6 — UI runtime
- `drizzle-orm` 0.45.2 — ORM layer (`drizzle-orm/node-postgres` driver used)
- `pg` 8.20.0 — Postgres driver, underlies Drizzle's node-postgres adapter
- `dotenv` 17.3.1 — declared as a dependency, but **not imported anywhere** in `src/`; Next.js already loads `.env` natively, making this dependency currently unused/dead weight.

**Dev dependencies**
- `typescript` 5.9.3, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` — typing support
- `drizzle-kit` 0.31.10 — schema push/migration tooling (config in `drizzle.config.json`)
- `tailwindcss` 4.1.17 + `@tailwindcss/postcss` 4.1.17 — styling pipeline
- `eslint` 9.39.4 + `eslint-config-next` 16.2.6 — linting, flat config

**Internal module graph**
```
src/app/layout.tsx        -> src/app/globals.css
src/app/page.tsx          -> src/db/index.ts -> pg (Pool), drizzle-orm/node-postgres
src/app/api/health/route.ts -> src/db/index.ts (same singleton pool)
src/db/schema.ts          -> (isolated; not imported by db/index.ts, not yet wired to drizzle() call)
```
Note: `drizzle(pool)` in `src/db/index.ts` is called **without passing the
schema** (`drizzle(pool, { schema })`), so even once tables are added to
`schema.ts`, Drizzle's relational query API (`db.query.*`) will not be
available until that wiring is added — only the SQL-builder API will work.

## 8. Build Process

- `npm run dev` → `next dev`
- `npm run build` → `next build`
- `npm run start` → `next start`
- `npm run lint` → `eslint .`
- `npm run typecheck` → `tsc --noEmit`
- Schema changes are expected to be applied with `npx drizzle-kit push` directly against the local Postgres instance (no `drizzle/` migrations folder exists, so `drizzle-kit generate` has never been run).
- `next.config.ts` uses default settings only — no custom headers, redirects, image domains, experimental flags, or environment passthrough configured.
- `tsconfig.json` is strict (`strict: true`), targets ES2017, uses the bundler module resolution required by Next 16, and includes the generated `.next/types` glob.

## 9. Duplicated Systems

- The Postgres connection string is **duplicated** in two places that must be kept manually in sync: `.env` (`DATABASE_URL`) and `drizzle.config.json` (`dbCredentials.url`), rather than `drizzle.config.json` reading `process.env.DATABASE_URL`.
- The identical DB health-check logic (`await db.execute(sql\`select 1\`)`) is duplicated between `src/app/page.tsx` and `src/app/api/health/route.ts` instead of being extracted into a shared helper.

## 10. Dead Code

- `dotenv` is listed in `package.json` dependencies but never imported/used anywhere in `src/`.
- `src/db/schema.ts` is a no-op module (`export {}`) — present but functionally inert until real tables are added.
- The globally-cached pool guard (`globalForDb.__arenaNextJsPostgresqlPool`) only ever gets read/written in dev; in production a new `Pool` is created per cold start with no cleanup path, but this is standard/expected for serverless-style deployments rather than truly "dead," just worth flagging.

## 11. Missing Implementations

Relative to what a "you2ube" (YouTube-like) product would need — and relative to everything the audit checklist asked to inspect — the following are simply absent:
- No Supabase project/config of any kind.
- No authentication/authorization system (no users table, no sessions, no middleware route protection).
- No database schema/tables at all (videos, users, comments, likes, subscriptions, etc.) — `schema.ts` is empty.
- No API routes beyond `/api/health` (no CRUD endpoints, no upload endpoints, no search).
- No server actions.
- No React components beyond the two page-level files (no shared UI library, no layout components, no forms).
- No custom hooks.
- No utility/helper modules (`lib/`, `utils/`) of any kind.
- No file/video storage integration (e.g., S3, Supabase Storage, Cloudinary).
- No environment variable documentation (`.env.example`) beyond the raw `.env` file itself.
- No tests (unit, integration, or e2e) and no CI configuration.
- No `drizzle/` migrations directory — schema is push-only, so there is no historical migration trail to audit.

## 12. Security Issues

- **`.env` is committed/present in the project tree with a real (albeit local-only) credential** (`postgresql://postgres:postgres@127.0.0.1:5432/app_db`). It targets localhost only in this sandbox, so risk is low here, but there is no `.gitignore` visible in the listed file set and no `.env.example` to show the safe pattern for contributors.
- `drizzle.config.json` hardcodes the same DB credential a second time instead of reading `process.env.DATABASE_URL`, doubling the places a secret could leak if this file is ever committed to a shared repo with a non-local URL.
- The health-check endpoint (`/api/health`) swallows the real error via a bare `catch {}` and returns only `{ ok: false }` — acceptable for a public health check (avoids leaking internals), but there is no server-side logging of the failure either, which would make production DB outages harder to diagnose.
- No rate limiting, no CORS configuration, no security headers (CSP, HSTS, X-Frame-Options, etc.) configured in `next.config.ts` — not necessarily wrong for a bare starter, but notable since none of the standard hardening exists yet.
- Since there is no auth system at all, there is nothing to audit for auth-specific vulnerabilities (no session fixation, no JWT misconfiguration, etc.) — but this also means **zero access control exists** for any future data-bearing routes.

## 13. Architectural Conflicts

- `drizzle(pool)` is instantiated without the `schema` option, which conflicts with the eventual intent (implied by `schema.ts`'s comment) of using Drizzle's relational query builder — the two will need to be reconciled once real tables are added (`drizzle(pool, { schema })`).
- The task's own premise is in conflict with reality: it asks to audit Supabase config, middleware, authentication, server actions, and components that do not exist in either the linked GitHub repository or this sandbox. There is no `CLAUDE.md` anywhere to define an alternate source of truth.
- `page.tsx` performs a raw infrastructure health check (`select 1`) inside a user-facing page component, mixing an operational/diagnostic concern into presentational rendering logic — functionally harmless at this scale but a pattern that shouldn't be extended as real features are added.

## 14. Build Issues

- None currently blocking: the template is minimal enough that `next typegen`, `tsc --noEmit`, and `next build` all succeed as shipped (verified during this audit).
- Latent risk: because `drizzle.config.json` hardcodes its own DB URL rather than reading `.env`, `npx drizzle-kit push` will silently target the wrong database if `.env`'s `DATABASE_URL` is ever changed without also updating `drizzle.config.json`.
- No CI/build pipeline (GitHub Actions, etc.) exists in either the sandbox or the `you2ube` repo, so none of the above is currently enforced automatically on push.

---

## Summary

This sandbox contains a clean, minimal, working Next.js + Drizzle + Postgres
starter with no functional issues in isolation — it builds, type-checks, and
serves a health-checked page correctly. However, it implements **none** of
the "you2ube" application features implied by the task (no Supabase, no auth,
no schema, no components, no API surface beyond a health check), and the
`https://github.com/Dragxon4000/you2ube` repository referenced by the task is
an empty shell with only a `README.md`. No `CLAUDE.md` exists anywhere to
supply the missing instructions. Per the task's explicit constraints, no
features have been implemented and no existing code has been rewritten —
this document is audit-only.
Summary
I implemented a single, self-hosted, credentials-based authentication system for this Next.js + PostgreSQL/Drizzle project (the repo was actually just the blank starter template — no pre-existing auth, middleware, or RLS to reuse or conflict with, so this is the one and only architecture).

Database schema (src/db/schema.ts): users, profiles (auto-created 1:1 with each user), sessions (hashed opaque tokens), and verification_tokens (shared by email verification + password reset, single-use, expiring). Pushed live via drizzle-kit push.

Core auth library (src/lib/auth/): bcrypt password hashing, SHA-256-hashed session/verification tokens, createSession/getSessionUser/destroySession helpers, and an atomic createUserWithProfile transaction.

API routes: /api/auth/{signup,login,logout,me,forgot-password,reset-password,verify-email,resend-verification} — all validating input, using httpOnly/secure/sameSite cookies.

Routing/UI: /login, /signup, /forgot-password, /reset-password, /verify-email, and a protected /dashboard showing profile data with logout.

Middleware: implemented as src/proxy.ts (Next.js 16's stable replacement for middleware.ts, running on the Node.js runtime) — it queries the DB directly to guard /dashboard/* and bounce authenticated users away from /login//signup.

OAuth/email: no OAuth or email-provider secrets were configured in this environment, so OAuth was skipped per the rules, and email verification/password-reset links are fully functional but delivered via server console logging instead of a real inbox (clearly documented in code/UI).
