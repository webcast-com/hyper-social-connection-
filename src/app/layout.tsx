import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { prisma, hasDatabase } from '@/lib/prisma';
import { getViewer } from '@/lib/viewer';
import { getSiteUrl } from '@/lib/site-url';
import { getSiteMetadata } from '@/components/SEO/SEOMeta';
import { GOOGLE_FONTS_STYLESHEET } from '@/lib/fonts';
import { Analytics } from '@vercel/analytics/next';

const siteUrl = getSiteUrl();

export const metadata: Metadata = getSiteMetadata(siteUrl);

// `viewport-fit=cover` lets the CSS `env(safe-area-inset-*)` variables work
// on notched phones, which the mobile bottom nav uses for its padding.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// The app renders the signed-in viewer per request, so skip static
// prerendering (also keeps builds from needing live DB credentials).
export const dynamic = 'force-dynamic';

function DocumentHead() {
  return (
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS_STYLESHEET} />
      {/* Apply the saved/system theme before hydration to avoid a flash of
          the wrong theme. Only touches <html>'s class (not managed by
          React), so it can never cause a hydration mismatch. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
        }}
      />
    </head>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();

  // No authenticated user: render without the main app shell.
  // This prevents Navbar crashes and allows /login and /signup to render cleanly.
  // Protected pages should redirect to /login themselves (or use middleware).
  if (!user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <DocumentHead />
        <body className="font-sans app-page-bg bg-gray-100 dark:bg-gray-900 min-h-screen" suppressHydrationWarning>
          <div className="app-surface">{children}</div>
          <Analytics />
        </body>
      </html>
    );
  }

  let unread: { id: number }[] = [];
  if (hasDatabase) {
    try {
      unread = await prisma.notification.findMany({
        where: { userId: user.id, isRead: 0 },
        select: { id: true },
      });
    } catch (err) {
      console.warn('[layout] notifications query failed:', (err as Error)?.message);
      unread = [];
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <DocumentHead />
      <body className="font-sans app-page-bg bg-gray-100 dark:bg-gray-900 min-h-screen" suppressHydrationWarning>
        <Navbar user={user} unreadCount={unread.length} isDemo={!hasDatabase} />
        {/* pb-20 on mobile leaves room for the bottom tab bar */}
        <main className="app-surface pt-16 pb-20 md:pb-8 max-w-7xl mx-auto">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
