import { NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth';

export async function POST() {
  // Clear the JWT session cookie.
  await logoutUser();
  return NextResponse.json({ success: true });
}
