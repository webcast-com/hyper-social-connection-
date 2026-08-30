# hyper — Hyper Social Connection

A full-featured social media platform built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS 4** and **PostgreSQL** (via Prisma ORM).

Runs on **any PostgreSQL database** — Neon, AWS RDS, Railway, DigitalOcean, Supabase (as a plain Postgres host), or a local install. No proprietary services required.

![status](https://img.shields.io/badge/status-active-blue) ![next](https://img.shields.io/badge/Next.js-16-black) ![react](https://img.shields.io/badge/React-19-61dafb) ![db](https://img.shields.io/badge/PostgreSQL-any-336791)

## ✨ Features

- **Feed** — For You (engagement-ranked), Following, and Saved tabs with optimistic likes, comments, reposts and bookmarks
- **Posts** — text, images, videos, link previews, polls, edit & delete, hashtags & mentions, privacy levels
- **Stories** — 24-hour stories with a full-screen viewer (auto-advance, pause, keyboard nav)
- **Chat** — direct messages with live updates, quick emoji reactions, active-status banner
- **Groups** — communities with member-only posting, admin controls, events, and native peer-to-peer WebRTC video/audio calls
- **Movies API** — searchable, paginated demo catalog at `/api/movies`
- **Profiles** — cover photo, avatar, bio, photo grid, followers
- **Search** — people and posts, with trending topics computed from real hashtag usage
- **Sports** — live scores and fixtures aggregated from ESPN + TheSportsDB (`/sports`)
- **Notifications** — likes, comments, follows, messages, reposts with unread badges
- **Dark mode** — fully themed, respects system preference, no flash on load
- **PWA** — installable via `manifest.webmanifest`
- **Graceful demo mode** — with no database the app boots with demo content instead of crashing

## 🚀 Quick start

```bash
npm install

# Optional: connect a database (see DATABASE.md for provider guides)
cp .env.example .env.local
# → set DATABASE_URL in .env.local (sessions are stored in Prisma)

npm run dev        # http://localhost:3000
```

With a database connected, run once to create the tables:

```bash
npm run db:push
```

Tables are also auto-created on first boot (`CREATE … IF NOT EXISTS`), and an empty database is auto-seeded with demo users and posts.

**No database?** The app still boots in demo mode with anonymous, read-only content; sign-up/sign-in and mutations are disabled until a database is connected.

## 📜 Scripts

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack)                |
| `npm run build`     | Production build                                |
| `npm start`         | Serve the production build                      |
| `npm run lint`      | ESLint (0 errors; img warnings are intentional) |
| `npm run typecheck` | TypeScript `--noEmit`                           |
| `npm run db:push`   | Sync the database with `src/db/schema.ts`       |

## 🗄️ Database

Everything is plain PostgreSQL accessed through **Prisma ORM** (`prisma/schema.prisma`, driver adapter `@prisma/adapter-pg`). See **[DATABASE.md](DATABASE.md)** for:

- provider connection-string guides (Neon, RDS, Railway, local, …)
- TLS options (`DATABASE_SSL=false` for local databases without TLS)
- the zero-Docker local database (`npm run db:local`) and the auth tables

## 🧱 Project structure

```
src/
├── app/                  # Next.js App Router pages & API routes
│   ├── api/              # auth, upload, messages (chat polling), health, …
│   ├── page.tsx          # Home feed
│   ├── messages/         # Direct messages
│   ├── groups/           # Communities
│   └── …                 # discover, search, notifications, profile, settings
├── components/           # Post, Stories, Chat, FeedTabs, EmptyState, …
├── db/
│   ├── schema.ts         # Drizzle schema (single source of truth)
│   └── index.ts          # Pool + graceful offline downgrade
└── lib/                  # auth (Prisma sessions), seeding, migrations, viewer
```

## 🔐 Auth & uploads

- **Auth:** email + password (bcrypt) with opaque, revocable Prisma database sessions (`src/lib/auth.ts`). The session cookie is HttpOnly and expires after 7 days; demo/offline mode is anonymous and read-only.
- **Uploads:** images/videos (15 MB images / 250 MB videos, login required, magic-byte sniffed). The browser first asks `/api/upload/presign` for a presigned PUT and sends the bytes **straight to the object store**, then `/api/upload/verify` sniffs what landed and deletes anything that is not a real image/video. That keeps large files working on platforms with small request-body caps. With no object store configured (local disk under `public/uploads`) it falls back to posting the bytes to `/api/upload`. Postgres stores only the stable URL `/uploads/<uuid>.<ext>` — never a presigned link. See **[DATABASE.md](DATABASE.md#media--object-storage)**.
- **Chat delivery:** the client polls `/api/messages` every 3 seconds. Swap in WebSockets/SSE later if you want push delivery.
- **Group calls:** native peer-to-peer WebRTC. Browsers connect directly to each other, while Postgres serves as the signaling relay (who is in the call plus SDP/ICE messages) via `/api/group-calls` — no third-party provider or API key required. See [`src/lib/group-call.ts`](src/lib/group-call.ts). For reliable connectivity across strict NATs a TURN server can be added in `src/components/Call/WebRTCRoom.tsx`.

## 🌍 Deployment

Works anywhere Next.js runs. On **Vercel**:

1. Import the repo.
2. Add the environment variables below (Project → Settings → Environment Variables, for Production *and* Preview).
3. Deploy — tables self-create on the first request.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Authentication sessions live in Prisma's `sessions` table. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://your-app.vercel.app`. |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object store for media (`PRISMA_BUCKET_*` aliases are accepted). |
| `S3_REGION`, `S3_FORCE_PATH_STYLE` | Usually `auto` and `true` for S3-compatible providers. |
| `ALLOW_DEMO_SEED` | Set `true` **only** for demo instances — see below. |

Notes that matter on serverless:

- **Object storage is required, not optional.** The Vercel filesystem is ephemeral, and functions cap request bodies at **4.5 MB** — larger photos and all video fail with `413` if the bytes go through a function. With `S3_*` configured, uploads bypass functions entirely via presigned PUTs.
- **Allow the site's origin on the bucket** so those direct PUTs are not blocked by CORS:
  ```bash
  npm run storage:cors               # uses NEXT_PUBLIC_SITE_URL + localhost + *.vercel.app
  npm run storage:cors -- https://my-domain.com
  ```
  Until CORS is set, uploads quietly fall back to `/api/upload` (fine under 4.5 MB).
- **Demo seeding is disabled in production.** `ensureSeeded()` only runs outside `NODE_ENV=production`, or when `ALLOW_DEMO_SEED=true`, so demo logins (`alex@example.com` / `changeme123`) never appear on a live deployment. For a demo instance set the flag, or seed with `npm run db:seed`.

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md) for the phase history (latest: Supabase decoupling + UI polish).
