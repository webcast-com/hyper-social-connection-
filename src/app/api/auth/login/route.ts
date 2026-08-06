import { NextResponse } from 'next/server';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

import { ensureSeeded } from '@/lib/seed';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Offline fallback: allow demo login without a live DB so preview still works
    if (!hasDatabase) {
      const demoPasswordOk = password === 'demo1234' && email.endsWith('@demo.com');
      if (demoPasswordOk) {
        // Map demo emails to ids 1..8 so the viewer can resolve correctly
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
        const userId = demoIds[email] ?? 1;
        await loginUser(userId);
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