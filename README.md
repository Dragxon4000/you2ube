# you2ube

A production-oriented YouTube + social desktop-style web application built with Next.js App Router, PostgreSQL, Drizzle ORM, official YouTube APIs, and server-side Supabase Storage integration.

## Current architecture

### Authentication

The app currently uses one custom credentials-based authentication system:

- `users` stores email + bcrypt password hash.
- `profiles` stores one editable profile per user.
- `sessions` stores hashed opaque session tokens.
- Auth cookies are httpOnly and managed server-side.
- Email verification and password reset tokens are stored hashed in `verification_tokens`.

Do not add a parallel auth system without first resolving the architecture conflict in `AUDIT_LOG.md`.

### Official YouTube integration

The YouTube feature uses only official YouTube services:

- **YouTube Data API v3** provides search and video metadata.
- **YouTube IFrame Player API** provides in-app playback at `/watch/[id]`.
- The browser plays directly from YouTube's embedded player. The application never downloads, stores, transforms, or proxies video bytes.
- Search result cards, watch-history cards, and the player include links back to YouTube.

Required server-side environment variable:

```bash
YOUTUBE_API_KEY=your_youtube_data_api_key
```

No YouTube API key is exposed to the browser. If the key is unavailable or the API is unavailable, routes return a clear safe error and the UI remains usable.

#### Data API quota safeguards

The Data API has default quotas that are subject to change. As of the official Google documentation cited during implementation, the default project allocation includes 100 `search.list` calls/day and 10,000 units/day for other endpoints.

The app reduces quota usage by:

- Caching search responses for 5 minutes.
- Fetching result metadata in one batched `videos.list` request.
- Caching single-video metadata and trending responses for 10 minutes.
- Limiting each local user/IP to six search attempts per minute.
- Returning `429` with `Retry-After` for local throttling and official quota/rate-limit responses.
- Avoiding automatic pagination or background polling.

The local limiter is intentionally best-effort. A horizontally scaled deployment should replace it with a shared Redis or edge rate-limit store. Monitor actual YouTube quota in Google Cloud Console and complete YouTube’s audit/quota-extension process before requesting more capacity.

#### Playback and continue watching

Authenticated users can:

- Search YouTube and inspect title, channel, thumbnail, duration, view count, and publish date.
- Play the selected video in `/watch/[id]` through the official IFrame Player API.
- Save playback position every 15 seconds, on pause, on playback completion, and when leaving the page.
- Continue a video from its most recently saved position.
- Open the original YouTube watch page at any time.

`watch_sessions.watched_seconds` records the furthest observed timestamp. `watch_sessions.resume_position_seconds` stores the exact resume timestamp. One row is enforced for every user/video pair.

### Supabase Storage and Realtime

Supabase is used for avatar object storage and social realtime transport. Identity remains the existing custom application auth system; Supabase Auth is intentionally not used.

The server uses one shared Supabase admin client for Storage and Realtime. Social mutations follow:

```text
Browser → authenticated Next.js API route → Drizzle/PostgreSQL → Supabase Realtime Broadcast
```

The server broadcasts only a non-sensitive invalidation event to a user-scoped channel. The browser then refetches private rows through the authenticated API route. This avoids relying on `auth.uid()` or exposing social rows to an anonymous Supabase client.

Required for server Storage/Re​​altime broadcasts:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Required for browser Realtime subscriptions:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

If the browser Realtime configuration is absent or unavailable, the social UI uses authenticated polling as a graceful fallback. The database migration adds social tables to the `supabase_realtime` publication when that publication exists on a Supabase-hosted database.

### Supabase Storage avatars

Supabase Storage continues to provide avatar object storage only. Identity remains the existing application auth system.

Required for avatar uploads:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_AVATAR_BUCKET=avatars
```

The avatar bucket should exist in Supabase Storage. The app uploads files server-side using the service role key and stores the resulting public URL/path in `profiles.avatar_url` and `profiles.avatar_path`.

Supported avatar file types:

- JPEG
- PNG
- WebP
- GIF

Maximum size: 2 MB.

## Database migrations

Schema is defined in `src/db/schema.ts` and pushed with Drizzle Kit.

SQL migrations retained in the repository:

```bash
drizzle/0001_profile_system.sql
drizzle/0002_youtube_playback.sql
drizzle/0003_social_system.sql
drizzle/0004_social_rls_policies.sql
drizzle/0005_social_hardening_realtime.sql
```

Apply schema changes in local development with:

```bash
npx drizzle-kit push
```

The playback migration adds `resume_position_seconds`, removes legacy duplicate user/video history records by retaining the latest row, and creates a composite unique index for `(user_id, video_id)`.

The social migrations add canonical `sender_id`/`receiver_id` requests, one-row canonical `user_a`/`user_b` friendships, JSONB activities, complete presence state, indexes/constraints, RLS write protection, and Supabase Realtime publication membership.

## Important routes

### Pages

- `/` — landing page
- `/signup` — account creation
- `/login` — login
- `/dashboard` — protected app dashboard and continue-watching history
- `/watch/[id]` — protected official YouTube embedded player
- `/profile` — protected profile editor
- `/users/[id]` — public profile page honoring privacy settings
- `/social` — protected internal friends, presence, activity feed, and history
- `/forgot-password` — password reset request
- `/reset-password` — password reset form
- `/verify-email` — email verification

### API

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/profile/avatar`
- `DELETE /api/profile/avatar`
- `GET /api/youtube/search`
- `GET /api/youtube/trending`
- `GET /api/youtube/video/[id]`
- `GET /api/watch`
- `POST /api/watch`
- `GET /api/xp`
- `GET /api/social/friends`
- `POST /api/social/friends/request`
- `POST /api/social/friends/remove`
- `POST /api/social/requests/[id]/accept`
- `POST /api/social/requests/[id]/reject`
- `POST /api/social/requests/[id]/cancel`
- `GET /api/social/feed`
- `GET /api/social/activity`
- `POST /api/social/presence`
- `GET /api/social/presence`
- `GET /api/social/users/search`
- `GET /api/health`

## Validation

Run before finishing changes:

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Then run the platform `build_and_start` validation.

### Social system

you2ube includes an internal social system. It does not use Discord friends and does not add Supabase Auth:

- Send, accept, reject, and cancel friend requests.
- Remove friends.
- Canonical one-row friendships prevent duplicate relationships.
- Online/away/offline presence with last-seen timestamps.
- Current video ID and title while watching, plus an optional custom status.
- Friends activity feed and private user activity history.
- Automatic `watch_start`, `watch_complete`, `friend_added`, and `level_up` events.
- An idempotent server achievement unlock helper emits `achievement_unlock` events.

Authenticated API endpoints live under `/api/social/*`. Social data is stored directly in PostgreSQL and protected by the existing httpOnly session cookie, server ownership checks, PostgreSQL foreign keys/cascades, uniqueness constraints, and RLS policies that deny direct client writes.

Supabase Realtime is used for user-scoped Broadcast invalidation events after successful database writes. The browser never receives private social rows from Realtime; it refetches through authorized Next.js API routes. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser subscription and `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` for server broadcasts. If Realtime is unavailable, authenticated polling remains active.
