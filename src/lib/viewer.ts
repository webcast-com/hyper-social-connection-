import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function getViewer() {
  await ensureSeeded();

  const session = await getSession();
  if (session?.userId) {
    const signedIn = await db.select().from(users).where(eq(users.id, Number(session.userId))).limit(1);
    if (signedIn[0]) return signedIn[0];
  }

  const demo = await db.select().from(users).where(eq(users.email, 'alex@demo.com')).limit(1);
  if (demo[0]) return demo[0];

  const first = await db.select().from(users).limit(1);
  if (!first[0]) throw new Error('No public viewer is available');
  return first[0];
}
