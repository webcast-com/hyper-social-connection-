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
    return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development'
      ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
      : [];
  },
  // Files present in public/uploads are served statically first. Missing
  // names (Prisma bucket / S3 objects) fall through to /api/media, which
  // 302s to a short-lived presigned GET. Stored URLs stay `/uploads/…`.
  async rewrites() {
    return [{ source: "/uploads/:filename", destination: "/api/media/:filename" }];
  },
};

export default nextConfig;
