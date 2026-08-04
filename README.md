# you2ube

A production-oriented YouTube + social desktop-style web application built with Next.js App Router, PostgreSQL, Drizzle ORM, and server-side Supabase Storage integration.

## Current architecture

### Authentication

The app currently uses one custom credentials-based authentication system:

- `users` table stores email + bcrypt password hash.
- `profiles` table stores one profile per user.
- `sessions` table stores hashed opaque session tokens.
- Auth cookies are httpOnly and managed server-side.
- Email verification and password reset tokens are stored hashed in `verification_tokens`.

Do not add a parallel auth system without first resolving the architecture conflict in `AUDIT_LOG.md`.

### YouTube

YouTube search and metadata calls use the official YouTube Data API v3 from server-side route handlers.

Required for live search results:

```bash
YOUTUBE_API_KEY=your_youtube_data_api_key
```

Without this key, YouTube endpoints return empty results gracefully.

### Supabase Storage

Supabase is used for avatar object storage only in the current phase. Identity remains the existing application auth system.

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

The profile-system SQL migration is documented in:

```bash
drizzle/0001_profile_system.sql
```

Apply schema changes in local development with:

```bash
npx drizzle-kit push
```

## Important routes

### Pages

- `/` — landing page
- `/signup` — account creation
- `/login` — login
- `/dashboard` — protected app dashboard
- `/profile` — protected profile editor
- `/users/[id]` — public profile page honoring privacy settings
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
- `GET /api/health`

## Validation

Run before finishing changes:

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Then run the platform `build_and_start` validation.
