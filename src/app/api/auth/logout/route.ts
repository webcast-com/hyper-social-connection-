import { NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth';

export async function POST() {
  // Revoke the Prisma session and clear the opaque session cookie.
  await logoutUser();
  return NextResponse.json({ success: true });
}
