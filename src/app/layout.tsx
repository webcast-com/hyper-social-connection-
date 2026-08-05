import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getViewer } from '@/lib/viewer';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Hyper',
  description: 'A public social network demo',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();
  const unread = await db.select({ id: notifications.id }).from(notifications).where(
    and(eq(notifications.userId, user.id), eq(notifications.isRead, 0)),
  );

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-100 min-h-screen`}>
        <Navbar user={user} unreadCount={unread.length} />
        <main className="pt-16 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
