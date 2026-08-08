import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileForSupabaseUser } from '@/lib/supabase/profile';

export async function getViewer() {
  // ── Full Supabase Auth integration ──────────────────────────────────────
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await ensureProfileForSupabaseUser(user);
        if (profile) return profile;
      }
    } catch (e) {
      console.warn('[viewer] Supabase auth lookup failed:', (e as Error)?.message);
    }
  }

  // ── Database-backed authentication only ─────────────────────────────────
  try {
    await ensureSeeded();
  } catch (e) {
    console.warn('[viewer] ensureSeeded failed:', (e as Error)?.message);
  }

  if (!hasDatabase) {
    // No database and no Supabase — the app requires authentication.
    // Return null so callers can redirect to login.
    return null as any;
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
