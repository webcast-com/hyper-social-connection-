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

  // ── Full Supabase Auth ───────────────────────────────────────────────────
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error instanceof AuthApiError) {
          return NextResponse.json({ error: error.message }, { status: 401 });
        }
        console.warn('[login] Supabase Auth did not authenticate:', error.message);
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
      console.warn('[login] Supabase Auth unavailable:', (err as Error)?.message);
    }
  }

  // ── Real database authentication only ───────────────────────────────────
  try {
    if (!hasDatabase) {
      return NextResponse.json(
        { error: 'Authentication requires a configured database. Please set DATABASE_URL or use Supabase Auth.' },
        { status: 503 }
      );
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
