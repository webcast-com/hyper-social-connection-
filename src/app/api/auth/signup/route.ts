import { NextResponse } from 'next/server';
import { db, hasDatabase, ensureDbConnection } from '@/lib/prisma';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || '').trim();
  const name = String(body.name || username || '').trim();
  const rawEmail = String(body.email || '').trim().toLowerCase();
  const normalizedUsername = username.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const email = rawEmail || (normalizedUsername ? `${normalizedUsername}@username.local` : '');
  const password = String(body.password || '');

  try {
    const dbUp = await ensureDbConnection();
    if (!dbUp || !hasDatabase) {
      return NextResponse.json(
        { error: 'Sign up requires a connected database. Please check DATABASE_URL.' },
        { status: 503 }
      );
    }

    // Make sure the Prisma schema is present even when signup is the first
    // request after provisioning a new database.
    await ensureSeeded();

    if (!name || !email || password.length < 6) {
      return NextResponse.json(
        { error: 'Name, email and a password of at least 6 characters are required.' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.orm.public.User.create({
      name,
      email,
      password: hashedPassword,
    });

    await loginUser(user.id);
    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    // Duplicate email (unique constraint) → friendly message
    if (err?.code === '23505' || err?.code === 'P2002' || /unique|duplicate/i.test(err?.message || '')) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
