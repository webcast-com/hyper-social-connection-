import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/seed';

export async function POST() {
  await ensureSeeded();
  return NextResponse.json({ success: true, message: 'Seeded successfully' });
}
