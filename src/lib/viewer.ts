import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

// Static fallback used when DATABASE_URL is not configured or the DB is
// unreachable — lets every page render in preview/offline mode instead of 500-ing.
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
