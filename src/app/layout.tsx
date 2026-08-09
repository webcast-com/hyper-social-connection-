import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@fontsource-variable/inter';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import Navbar from '@/components/Navbar';
import { db, hasDatabase } from '@/db';
import { notifications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getViewer } from '@/lib/viewer';
import { getSiteUrl } from '@/lib/site-url';
import { getSiteMetadata } from '@/components/SEO/SEOMeta';

const siteUrl = getSiteUrl();

// Google Fonts (Inter + Poppins), self-hosted from the @fontsource packages
// — no build-time fetch and no runtime requests, so builds work in
// offline/restricted environments. Fonts are registered in globals.css via
// the Tailwind theme (`--font-sans` / `--font-display`) and fall back to
// the system stack if they are ever missing.

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();

  // No authenticated user: render without the main app shell.
  // This prevents Navbar crashes and allows /login and /signup to render cleanly.
  // Protected pages should redirect to /login themselves (or use middleware).
  if (!user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
            }}
          />
        </head>
        <body className="font-sans bg-gray-100 min-h-screen" suppressHydrationWarning>
          {children}
        </body>
      </html>
    );
  }

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before hydration to avoid a flash of
            the wrong theme. Only touches <html>'s class (not managed by
            React), so it can never cause a hydration mismatch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans bg-gray-100 min-h-screen" suppressHydrationWarning>
        <Navbar user={user} unreadCount={unread.length} />
        {/* pb-20 on mobile leaves room for the bottom tab bar */}
        <main className="pt-16 pb-20 md:pb-8 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
