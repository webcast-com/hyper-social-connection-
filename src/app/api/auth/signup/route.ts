import { NextResponse } from 'next/server';
import { prisma, hasDatabase } from '@/lib/prisma';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  try {
    if (!hasDatabase) {
      return NextResponse.json(
        { error: 'Sign up requires a configured database. Please set DATABASE_URL in .env.local.' },
        { status: 503 }
      );
    }

    if (!name || !email || password.length < 6) {
      return NextResponse.json(
        { error: 'Name, email and a password of at least 6 characters are required.' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    await loginUser(user.id);
    return NextResponse.json({ success: true, user });
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
