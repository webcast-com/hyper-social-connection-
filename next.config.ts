import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Arena live-preview host (and other e2b.app subdomains) to load
  // dev resources like fonts and HMR in development.
  allowedDevOrigins: ["*.e2b.app", "3000-i160o1qa97nd824tz8cst.e2b.app"],
  experimental: {
    // Match the 250 MB video cap in /api/upload so large clips are not
    // rejected by the Next.js / proxy body limit (default 10 MB).
    proxyClientMaxBodySize: "250mb",
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  // Canonical tags consolidate previews; this also prevents any preview route
  // (including pages overriding their robots metadata) from being indexed.
  async headers() {
    // The dashboard is indexable: its routes serve per-route metadata and an
    // X-Robots-Tag from src/app/nfl-basketball/**. ScoreHub stays out of the
    // index because it keeps its own standalone layout.
    const demoHeaders = ['/scorehub/:path*'].map((source) => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }));
    return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development'
      ? [...demoHeaders, { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
      : demoHeaders;
  },
  // Preserve ScoreHub's relative stylesheet and script paths in its standalone document.
  async redirects() {
    return [{ source: '/scorehub', destination: '/scorehub/index.htm', permanent: false }];
  },
  // Files present in public/uploads are served statically first. Missing
  // names (Prisma bucket / S3 objects) fall through to /api/media, which
  // 302s to a short-lived presigned GET. Stored URLs stay `/uploads/…`.
  async rewrites() {
    return {
      // Existing public assets win before the SPA fallback, including JS/CSS.
      fallback: [
        { source: '/nfl-basketball', destination: '/nfl-basketball/index.html' },
        { source: '/nfl-basketball/:path*', destination: '/nfl-basketball/index.html' },
        { source: '/uploads/:filename', destination: '/api/media/:filename' },
      ],
    };
  },
};

export default nextConfig;
