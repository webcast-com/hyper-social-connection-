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
  const body = await req.json();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

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
          const profile = await ensureProfileForSupabaseUser(data.user);
          if (!profile) {
            return NextResponse.json(
              { error: 'Account creation succeeded, but the profile database is unavailable. Please try again.' },
              { status: 503 },
            );
          }
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

  // ── Real database signup only ──────────────────────────────────────────
  try {
    if (!hasDatabase) {
      return NextResponse.json(
        { error: 'Sign up requires a configured database. Please set DATABASE_URL.' },
        { status: 503 }
      );
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
