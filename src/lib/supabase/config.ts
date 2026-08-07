/**
 * Central Supabase configuration.
 *
 * The app supports two modes:
 *
 * 1. **Full Supabase mode** — set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
 *    `.env.local` (plus `DATABASE_URL` for the server-side query layer).
 *    Authentication goes through Supabase Auth (email/password + OAuth),
 *    sessions are managed with @supabase/ssr cookies, uploads go to
 *    Supabase Storage, and chat uses Supabase Realtime.
 *
 * 2. **Offline / demo mode** — no env vars. The app falls back to the
 *    legacy JWT cookie auth and local demo data so the preview keeps
 *    working without a live project.
 *
 * The hardcoded fallbacks below keep the old behavior when nothing is
 * configured (they are only ever used in demo mode).
 */

const DEFAULT_SUPABASE_URL = "https://pjzhjzqzmajbastavmkd.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemhqenF6bWFqYmFzdGF2bWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTc0OTEsImV4cCI6MjEwMDU3MzQ5MX0.iTGgXDcJZqlNRCv5hh9lyFWs5Q5SHZRg-v78ttI7frQ";

// Prefer NEXT_PUBLIC_* in shared modules. Next.js can safely inline these
// public values into client bundles; the server-side names remain supported
// for existing deployments and are mirrored by next.config.ts.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_ANON_KEY;

/** Optional service-role key — used server-side for storage bucket setup. */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Storage bucket used for post/avatar/story media uploads. */
export const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

/**
 * True only when the user explicitly configured Supabase credentials.
 * The hardcoded fallbacks above never count as "configured" — demo mode
 * stays fully offline until real credentials are provided.
 */
export const isSupabaseConfigured =
  (!!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY) ||
  (!!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
