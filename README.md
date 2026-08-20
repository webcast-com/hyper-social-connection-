# hyper — Hyper Social Connection

A full-featured social media platform built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS 4** and **PostgreSQL** (via Prisma ORM).

Runs on **any PostgreSQL database** — Neon, AWS RDS, Railway, DigitalOcean, Supabase (as a plain Postgres host), or a local install. No proprietary services required.

![status](https://img.shields.io/badge/status-active-blue) ![next](https://img.shields.io/badge/Next.js-16-black) ![react](https://img.shields.io/badge/React-19-61dafb) ![db](https://img.shields.io/badge/PostgreSQL-any-336791)

## ✨ Features

- **Feed** — For You (engagement-ranked), Following, and Saved tabs with optimistic likes, comments, reposts and bookmarks
- **Posts** — text, images, videos, link previews, polls, edit & delete, hashtags & mentions, privacy levels
- **Stories** — 24-hour stories with a full-screen viewer (auto-advance, pause, keyboard nav)
- **Chat** — direct messages with live updates, quick emoji reactions, active-status banner
- **Groups** — communities with member-only posting, admin controls, join/leave
- **Profiles** — cover photo, avatar, bio, photo grid, followers
- **Search** — people and posts, with trending topics computed from real hashtag usage
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
- **Uploads:** images/videos are stored on local disk under `public/uploads` and served statically. Swap in S3/R2 by replacing `src/app/api/upload/route.ts` if you need CDN-backed storage.
- **Chat delivery:** the client polls `/api/messages` every 3 seconds. Swap in WebSockets/SSE later if you want push delivery.

## 🌍 Deployment

Works anywhere Next.js runs. On **Vercel**:

1. Import the repo.
2. Add environment variable `DATABASE_URL` (and optionally `NEXT_PUBLIC_SITE_URL`). Authentication sessions are stored in Prisma's `sessions` table.
3. Deploy — tables self-create on first request.

Note: Vercel's serverless filesystem is ephemeral, so local-disk uploads won't persist across deployments. Use an S3-compatible store for production media.

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md) for the phase history (latest: Supabase decoupling + UI polish).
