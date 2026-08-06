import { NextResponse } from 'next/server';
import { db, hasDatabase } from '@/db';
import { users } from '@/db/schema';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

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