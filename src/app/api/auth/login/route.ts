import { NextResponse } from 'next/server';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
