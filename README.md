# you2ube

Desktop-first video platform with a progression system (XP, levels, achievements, badges, rewards) and Discord integration. Built with **Next.js 16**, **PostgreSQL**, **Drizzle ORM**, **Tailwind CSS**, and wrapped in **Electron** for the desktop client.

## Features

- 🎯 **Progression system** — earn XP by watching videos, hosting watch parties, and inviting friends; level up through 25 levels; unlock 17 achievements, 8 badges, and 7 rewards
- 🎮 **Discord integration** — OAuth login, bot notifications via webhooks, Rich Presence via official RPC
- 🖥️ **Desktop client** — Electron wrapper with native notifications, auto-update, global shortcuts, and application menu
- 🔒 **Production security** — CSP, HSTS, X-Frame-Options, rate limiting, idempotency keys, session token hashing
- ♿ **Accessibility** — ARIA tablist pattern, skip-to-content link, keyboard navigation, error boundary
- 🧪 **Tested** — 25 unit tests, lint, typecheck, production build validation

## Quick start (local development)

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm

### 1. Clone and install

```bash
git clone https://github.com/Dragxon4000/you2ube.git
cd you2ube
npm install
```

### 2. Set up the database

Start a local Postgres instance (Docker example):

```bash
docker run -d --name you2ube-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 \
  postgres:15
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL if different from the default
```

### 4. Apply migrations

```bash
npx drizzle-kit migrate
# OR (dev only, non-destructive push):
npx drizzle-kit push
```

### 5. Run the dev server

```bash
npm run dev
# Open http://localhost:3000
```

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server at `:3000` |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run unit tests (node:test + tsx) |
| `npm run electron:dev` | Desktop client in dev mode (Next.js + Electron together) |
| `npm run electron:build` | Package desktop client for current platform |

## Desktop client

See [`docs/DESKTOP.md`](docs/DESKTOP.md) for full details on the Electron wrapper, packaging, and code signing.

Quick commands:

```bash
# Run desktop in dev mode
npm run electron:dev

# Package for current platform
npm run electron:build

# Package for specific platform
./scripts/electron-build.sh --mac
./scripts/electron-build.sh --win
./scripts/electron-build.sh --linux
```

## Discord integration (optional)

1. Create an application at https://discord.com/developers/applications
2. Add an OAuth2 redirect URI: `${NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`
3. Enable the `identify` scope (no other scopes needed)
4. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in `.env`
5. (Optional) Create a webhook in a Discord channel and set `DISCORD_WEBHOOK_URL`

See `src/lib/discord.ts` for the full list of official endpoints used.

## Deployment

### Vercel (recommended for web)

1. Push to GitHub
2. Import into Vercel
3. Set environment variables from `.env.example` in Vercel's dashboard
4. Deploy

### Self-hosted

```bash
npm ci
npm run build
# Apply migrations against your production DB
DATABASE_URL=<your-prod-url> npx drizzle-kit migrate
# Start
DATABASE_URL=<your-prod-url> npm start
```

### Docker

No Dockerfile is included. A minimal one would look like:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["npm", "start"]
```

## Project structure

```
you2ube/
├── drizzle/                    # Versioned SQL migrations
├── electron/                   # Electron main + preload
│   ├── main.ts                 # Main process
│   ├── preload.ts              # Typed bridge to renderer
│   └── tsconfig.json           # Separate TS config for Electron
├── scripts/                    # Shell scripts (electron-dev.sh, electron-build.sh)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── actions/        # XP-granting actions (watch, host-party, invite-friend)
│   │   │   ├── auth/discord/   # Discord OAuth flow
│   │   │   ├── achievements/   # Achievement list
│   │   │   ├── badges/         # Badge list
│   │   │   ├── health/         # Health check
│   │   │   ├── leaderboard/    # Top users by XP
│   │   │   ├── notifications/  # User notifications
│   │   │   ├── profile/        # Current user profile
│   │   │   ├── rewards/        # Reward list + claim
│   │   │   └── videos/         # Video catalog
│   │   ├── global-error.tsx    # Global error boundary
│   │   ├── layout.tsx          # Root layout
│   │   ├── not-found.tsx       # 404 page
│   │   ├── page.tsx            # Home page (tabbed dashboard)
│   │   ├── robots.ts           # robots.txt
│   │   └── sitemap.ts          # sitemap.xml
│   ├── components/             # React components
│   ├── db/
│   │   ├── index.ts            # Drizzle client
│   │   ├── schema.ts           # Database schema
│   │   └── seed.ts             # Idempotent seed data
│   ├── lib/
│   │   ├── api-helpers.ts      # Auth wrapper, rate limiting, error helpers
│   │   ├── desktop.ts          # Electron renderer bridge
│   │   ├── discord-rpc.ts      # Discord Rich Presence client
│   │   ├── discord.ts          # Discord OAuth + webhooks
│   │   ├── progression.ts      # XP/achievements/badges/rewards engine
│   │   ├── session.ts          # Session management
│   │   └── validate-env.ts     # Env var validation at startup
│   └── instrumentation.ts      # Next.js startup hook
└── AUDIT_LOG.md                # Full development history
```

## Testing

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --test-reporter spec

# Run specific test file
node --test --import tsx src/__tests__/validators.test.ts
```

## Security

The app implements:

- **Session token hashing** — full 48-char cookie is SHA-256 hashed and stored; cookie is validated on every request using constant-time comparison
- **CSRF protection** — `SameSite=lax` cookie + OAuth state token with timing-safe comparison
- **Rate limiting** — per-IP session creation limits + per-user action rate limits with IETF standard headers
- **Idempotency keys** — prevents double-XP on retries
- **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Input validation** — strict validators on all API inputs
- **SQL injection prevention** — Drizzle ORM parameterizes all queries
- **Transaction safety** — XP grants use `SELECT ... FOR UPDATE` + atomic updates

## Audit history

See [`AUDIT_LOG.md`](AUDIT_LOG.md) for the full development history including:

- Phase 6: Progression system
- Phase 6.5: Production hardening
- Phase 7: Discord integration
- Phase 8: Desktop client
- Phase 9: Production audit
- Full repository audit with evidence-based bug verification
- Production polish pass (security fixes + improvements)

## License

Private. See the original repository for licensing.
