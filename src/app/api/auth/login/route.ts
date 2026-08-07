import { NextResponse } from 'next/server';
import { AuthApiError } from '@supabase/supabase-js';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { ensureSeeded } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileForSupabaseUser } from '@/lib/supabase/profile';

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const isLegacyDemo = email.endsWith('@demo.com');

  // ── Full Supabase Auth ───────────────────────────────────────────────────
  // When the project is configured, authenticate through Supabase Auth. The
  // session cookie is written by the SSR client automatically.
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error instanceof AuthApiError && !isLegacyDemo) {
          // Real Supabase accounts should not silently fall back to the demo
          // JWT path. Legacy demo accounts are the intentional exception: they
          // live in public.users, not auth.users, even in full mode.
          return NextResponse.json({ error: error.message }, { status: 401 });
        }
        // A demo account (or an unreachable project) continues to the legacy
        // flow below. This keeps the documented demo login working when
        // Supabase Auth is enabled.
        console.warn('[login] Supabase Auth did not authenticate, using legacy flow:', error.message);
      } else if (data.user) {
        const profile = await ensureProfileForSupabaseUser(data.user);
        if (!profile) {
          return NextResponse.json(
            { error: 'Your account was authenticated, but the profile database is unavailable.' },
            { status: 503 },
          );
        }
        return NextResponse.json({ success: true, provider: 'supabase' });
      }
    } catch (err) {
      // Supabase unreachable (bad URL/key, offline network, …) — fall through
      // to the legacy flow below so the app still works.
      console.warn('[login] Supabase Auth unavailable, using legacy flow:', (err as Error)?.message);
    }
  }

  // ── Legacy / offline fallback (unchanged behavior) ──────────────────────
  try {
    // Offline fallback: allow demo login without a live DB so preview still works
    if (!hasDatabase) {
      const demoIds: Record<string, number> = {
        'alex@demo.com': 1,
        'maya@demo.com': 2,
        'jordan@demo.com': 3,
        'sophie@demo.com': 4,
        'marcus@demo.com': 5,
        'emma@demo.com': 6,
        'liam@demo.com': 7,
        'zara@demo.com': 8,
      };
      const demoPasswordOk = password === 'demo1234' && email in demoIds;
      if (demoPasswordOk) {
        await loginUser(demoIds[email]);
        return NextResponse.json({ success: true, offline: true });
      }
      return NextResponse.json({ error: 'Database not configured — only demo accounts (password: demo1234) can sign in offline.' }, { status: 503 });
    }

    await ensureSeeded();

    const userRes = await db.select().from(users).where(eq(users.email, email));
    if (userRes.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRes[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    await loginUser(user.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
