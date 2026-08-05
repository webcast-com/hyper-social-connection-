import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { loginUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

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