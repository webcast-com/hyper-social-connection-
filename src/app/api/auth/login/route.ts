import { NextResponse } from 'next/server';
import { prisma, hasDatabase } from '@/lib/prisma';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  try {
    if (!hasDatabase) {
      return NextResponse.json(
        { error: 'Authentication requires a configured database. Please set DATABASE_URL in .env.local.' },
        { status: 503 }
      );
    }

    await ensureSeeded();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

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
