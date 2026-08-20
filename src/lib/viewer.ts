import { prisma, hasDatabase, ensureDbConnection } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

/**
 * Resolve the currently authenticated user from the Prisma-backed session.
 *
 * Demo/offline mode is intentionally anonymous. The app may still render
 * read-only fallback content, but it must never treat that content's demo
 * author as an authenticated user or allow actions to run as user 1.
 */
export async function getViewer() {
  // A database is required for both authentication and the session lookup.
  // If it is missing or unreachable, return anonymous rather than a demo
  // identity. This keeps demo mode from bypassing authentication.
  const dbUp = await ensureDbConnection();
  if (!dbUp || !hasDatabase) return null;

  try {
    await ensureSeeded();
  } catch (error) {
    console.warn('[viewer] ensureSeeded failed:', (error as Error)?.message);
    return null;
  }

  try {
    const session = await getSession();
    if (!session?.userId) return null;

    const signedIn = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    return signedIn || null;
  } catch (error) {
    console.warn('[viewer] DB query failed:', (error as Error)?.message);
    return null;
  }
}
