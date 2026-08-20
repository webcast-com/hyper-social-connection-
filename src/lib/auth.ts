import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma, hasDatabase, markDatabaseDown } from '@/lib/prisma';

const SESSION_COOKIE = 'session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Database-backed session authentication.
 *
 * The browser receives a random opaque token. Only its SHA-256 hash is stored
 * in Prisma's `sessions` table, so authentication is revocable and does not
 * depend on an application signing secret.
 */
function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCookieOptions(expires: Date) {
  return {
    expires,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

/** Create a persistent Prisma session and put its opaque token in an HttpOnly cookie. */
export async function loginUser(userId: number) {
  if (!hasDatabase) {
    throw new Error('Authentication requires a connected database');
  }

  const token = randomBytes(32).toString('base64url');
  const sessionToken = hashSessionToken(token);
  const expires = new Date(Date.now() + SESSION_DURATION_MS);

  try {
    // Keep old expired rows from accumulating for users who log in regularly.
    await prisma.session.deleteMany({
      where: { userId, expires: { lt: new Date() } },
    });
    await prisma.session.create({
      data: { sessionToken, userId, expires },
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  } catch (error) {
    markDatabaseDown();
    throw error;
  }
}

/** Revoke the current database session and clear its browser cookie. */
export async function logoutUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token && hasDatabase) {
    try {
      await prisma.session.deleteMany({
        where: { sessionToken: hashSessionToken(token) },
      });
    } catch (error) {
      // Logout should still clear the browser cookie if the database is down.
      markDatabaseDown();
      console.warn('[auth] Could not revoke database session:', (error as Error)?.message);
    }
  }

  cookieStore.set(SESSION_COOKIE, '', {
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Resolve the current opaque cookie token against Prisma's sessions table.
 * Expired, missing, or invalid sessions are anonymous — never demo users.
 */
export async function getSession(): Promise<{ userId: number; expires: Date } | null> {
  if (!hasDatabase) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: hashSessionToken(token) },
      select: { userId: true, expires: true },
    });

    if (!session) return null;

    if (session.expires <= new Date()) {
      await prisma.session.deleteMany({
        where: { sessionToken: hashSessionToken(token) },
      });
      return null;
    }

    return session;
  } catch (error) {
    markDatabaseDown();
    console.warn('[auth] Session lookup failed:', (error as Error)?.message);
    return null;
  }
}
