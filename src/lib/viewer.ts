import { db, hasDatabase, ensureDbConnection } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

/**
 * Demo-mode viewer. When no database is configured the whole app runs on
 * demo data as "Alex Rivera" (id 1) — the same fallback the feed and the
 * server actions use (`getUserId()` defaults to 1). Returning the demo
 * viewer here keeps the app shell (header, notifications, profile links)
 * consistent with the demo content instead of collapsing to an anonymous
 * layout.
 */
export const DEMO_VIEWER = {
  id: 1,
  name: 'Alex Rivera',
  email: 'alex@example.com',
  password: '',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
  coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.',
  createdAt: new Date(),
};

/**
 * Resolves the currently signed-in user from the JWT session cookie.
 * Returns null when nobody is signed in, except in demo/offline mode
 * (no DATABASE_URL, or the database is unreachable) where the demo
 * viewer is returned instead.
 */
export async function getViewer() {
  // Probe the connection first (one-shot per process). When DATABASE_URL is
  // missing OR the database is unreachable, hasDatabase is downgraded and we
  // serve the demo experience — deterministic regardless of request order.
  const dbUp = await ensureDbConnection();
  if (!dbUp) {
    return DEMO_VIEWER as any;
  }

  try {
    await ensureSeeded();
  } catch (e) {
    console.warn('[viewer] ensureSeeded failed:', (e as Error)?.message);
  }

  try {
    const session = await getSession();
    if (session?.userId) {
      const signedIn = await db.select().from(users).where(eq(users.id, Number(session.userId))).limit(1);
      if (signedIn[0]) return signedIn[0];
    }

    // No logged-in user — return null (pages should handle unauthenticated state)
    return null as any;
  } catch (err) {
    console.warn('[viewer] DB query failed:', (err as Error)?.message);
    return null as any;
  }
}
