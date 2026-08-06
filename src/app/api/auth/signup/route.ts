import { NextResponse } from 'next/server';
import { AuthApiError } from '@supabase/supabase-js';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileForSupabaseUser } from '@/lib/supabase/profile';
import { getSiteUrl } from '@/lib/site-url';

const SITE_ORIGIN = getSiteUrl();

export async function POST(req: Request) {
  const { name, email, password } = await req.json();

  // ── Full Supabase Auth ───────────────────────────────────────────────────
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${SITE_ORIGIN}/api/auth/callback`,
        },
      });

      if (error) {
        if (error instanceof AuthApiError) {
          // Duplicate email, weak password, … — a genuine auth failure.
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        // Unreachable project / offline network — fall through to the
        // legacy flow (which is disabled offline, as before).
        console.warn('[signup] Supabase Auth unreachable, using legacy flow:', error.message);
      } else {
        if (data.user) {
          await ensureProfileForSupabaseUser(data.user);
        }

        // When email confirmation is enabled Supabase returns no session yet —
        // the user must confirm their email first. The signup page shows a
        // message instead of pretending the user is signed in.
        return NextResponse.json({
          success: true,
          provider: 'supabase',
          requiresEmailConfirmation: !data.session,
        });
      }
    } catch (err) {
      console.warn('[signup] Supabase Auth unavailable, using legacy flow:', (err as Error)?.message);
    }
  }

  // ── Legacy / offline fallback (unchanged behavior) ──────────────────────
  try {
    if (!hasDatabase) {
      return NextResponse.json({ error: 'Database not configured — sign-ups are disabled offline. Use a demo account (password: demo1234) or add DATABASE_URL to .env.local and restart.' }, { status: 503 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.insert(users).values({
      name,
      email,
      password: hashedPassword,
    }).returning();

    const user = result[0];
    await loginUser(user.id);
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
