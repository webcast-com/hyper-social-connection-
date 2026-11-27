import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import SiteFooter from '@/components/SiteFooter';
import LaunchScreen, { LAUNCH_SCREEN_SCRIPT } from '@/components/LaunchScreen';
import { db, hasDatabase } from '@/lib/prisma';
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
  colorScheme: 'dark',
  themeColor: '#08111f',
};

// The app renders the signed-in viewer per request, so skip static
// prerendering (also keeps builds from needing live DB credentials).
export const dynamic = 'force-dynamic';

const POPADS_SCRIPT = `/*<![CDATA[/* */
(function(){var a=window,p="f927583f7d4008399ed148a298f29426",e=[["siteId",607+451*27+5315529],["minBid",0],["popundersPerIP","0"],["delayBetween",0],["default",false],["defaultPerDay",0],["topmostLayer","auto"]],d=["d3d3LmNkbjRhZHMuY29tL2pmb3JtbHkubWluLmNzcw==","ZDNnNW92Zm5nanc5YncuY2xvdWRmcm9udC5uZXQvQ1RLVnIvbnBvbHlnbG90Lm1pbi5qcw=="],b=-1,s,r,i=function(){clearTimeout(r);b++;if(d[b]&&!(1821653275000<(new Date).getTime()&&1<b)){s=a.document.createElement("script");s.type="text/javascript";s.async=!0;var k=a.document.getElementsByTagName("script")[0];s.src="https://"+atob(d[b]);s.crossOrigin="anonymous";s.onerror=i;s.onload=function(){clearTimeout(r);a[p.slice(0,16)+p.slice(0,16)]||i()};r=setTimeout(i,5E3);k.parentNode.insertBefore(s,k)}};if(!a[p]){try{Object.freeze(a[p]=e)}catch(e){}i()}})();
/*]]>/* */`;

function DocumentHead() {
  return (
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS_STYLESHEET} />
      <meta name="fo-verify" content="14ce23b7-528a-4490-88f7-5f3043e433e6" />
      {/* Before the first paint: an installed app opens on the launch screen. */}
      <script dangerouslySetInnerHTML={{ __html: LAUNCH_SCREEN_SCRIPT }} />
      <script type="text/javascript" data-cfasync="false" dangerouslySetInnerHTML={{ __html: POPADS_SCRIPT }} />
    </head>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();

  // Navigation is public. Each protected page/action still enforces its own
  // authentication; guests see sign-in/sign-up controls instead of an identity.
  let unread: { id: number }[] = [];
  if (user && hasDatabase) {
    try {
      unread = await db.orm.public.Notification.where({ userId: user.id, isRead: 0 }).select('id').all();
    } catch (err) {
      console.warn('[layout] notifications query failed:', (err as Error)?.message);
      unread = [];
    }
  }

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <DocumentHead />
      <body className="font-sans app-page-bg bg-gray-100 dark:bg-gray-900 min-h-screen" suppressHydrationWarning>
        <LaunchScreen />
        <Navbar user={user} unreadCount={unread.length} isDemo={!hasDatabase} />
        {/* Shared safe-area-aware spacing keeps content above the mobile tabs. */}
        <main className="app-main app-surface max-w-7xl mx-auto">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
