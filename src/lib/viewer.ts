import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileForSupabaseUser } from '@/lib/supabase/profile';

// Static fallback used when no database and no Supabase project are
// configured — lets every page render in preview/offline mode instead of 500-ing.
export const FALLBACK_VIEWER = {
  id: 1,
  name: 'Alex Johnson',
  email: 'alex@demo.com',
  password: '',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
  coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler. Living life one adventure at a time!',
  createdAt: new Date(),
} as const;

export async function getViewer() {
  // ── Full Supabase Auth integration ──────────────────────────────────────
  // When the project is configured, the signed-in Supabase user is resolved
  // to their `users` row (creating/linking it on the fly if needed).
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await ensureProfileForSupabaseUser(user);
        if (profile) return profile;
      }
    } catch (e) {
      console.warn('[viewer] Supabase auth lookup failed, falling back:', (e as Error)?.message);
    }
  }

  // ── Legacy / offline mode (unchanged behavior) ──────────────────────────
  try {
    await ensureSeeded();
  } catch (e) {
    console.warn('[viewer] ensureSeeded failed, using fallback viewer:', (e as Error)?.message);
    return FALLBACK_VIEWER as any;
  }

  // If no DB is configured, immediately return the demo viewer so the app
  // is usable in offline/preview builds without a live Postgres.
  if (!hasDatabase) {
    // Still try to honor a signed-in session if one exists, but never fail.
    try {
      const session = await getSession();
      if (session?.userId) {
        const signedIn = await db.select().from(users).where(eq(users.id, Number(session.userId))).limit(1);
        if (signedIn[0]) return signedIn[0];
      }
    } catch {}
    return FALLBACK_VIEWER as any;
  }

  try {
    const session = await getSession();
    if (session?.userId) {
      const signedIn = await db.select().from(users).where(eq(users.id, Number(session.userId))).limit(1);
      if (signedIn[0]) return signedIn[0];
    }

    const demo = await db.select().from(users).where(eq(users.email, 'alex@demo.com')).limit(1);
    if (demo[0]) return demo[0];

    const first = await db.select().from(users).limit(1);
    if (!first[0]) throw new Error('No public viewer is available');
    return first[0];
  } catch (err) {
    console.warn('[viewer] DB query failed, falling back to demo viewer:', (err as Error)?.message);
    return FALLBACK_VIEWER as any;
  }
}
