import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { db, hasDatabase } from '@/db';
import { notifications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getViewer } from '@/lib/viewer';

// System font stack (no build-time fetch to Google Fonts, so builds work
// in offline/restricted environments). Tailwind's `font-sans` resolves to
// a modern system-ui stack.
const inter = { className: 'font-sans' };

export const metadata: Metadata = {
  title: 'Hyper',
  description: 'A public social network demo',
};

// The app renders the signed-in viewer per request, so skip static
// prerendering (also keeps builds from needing live DB credentials).
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();
  let unread: { id: number }[] = [];
  if (hasDatabase) {
    try {
      unread = await db.select({ id: notifications.id }).from(notifications).where(
        and(eq(notifications.userId, user.id), eq(notifications.isRead, 0)),
      );
    } catch (err) {
      console.warn('[layout] notifications query failed:', (err as Error)?.message);
      unread = [];
    }
  }

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-100 min-h-screen`}>
        <Navbar user={user} unreadCount={unread.length} />
        <main className="pt-16 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
