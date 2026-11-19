import type { NextConfig } from "next";
import { githubHighlightsUrl } from "./src/lib/highlights-source";

/**
 * Where the stored highlights list is read from: the `highlights-data` branch
 * of the repository this build came from (see src/lib/highlights-source.ts).
 * Worked out here, at build time, because that is when every host says which
 * repository it is building. Set HIGHLIGHTS_DATA_URL to point somewhere else,
 * or HIGHLIGHTS_STORE=database at run time to keep the list in Postgres.
 * A build on a developer's machine has no repository and gets no address.
 */
function highlightsDataUrl(): string {
  const explicit = process.env.HIGHLIGHTS_DATA_URL?.trim();
  if (explicit) return explicit;
  const env = process.env;
  const netlify = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(env.REPOSITORY_URL ?? "")?.[1];
  const repository = env.HIGHLIGHTS_DATA_REPOSITORY?.trim()
    || (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : "")
    || env.GITHUB_REPOSITORY
    || netlify
    // A hosted build that did not say which repository it is: this one.
    || (env.VERCEL || env.NETLIFY ? "webcast-com/hyper-social-connection-" : "");
  return repository ? githubHighlightsUrl(repository) : "";
}

const HIGHLIGHTS_DATA_URL = highlightsDataUrl();
// Said once, in the build log, so it can be checked there.
if (process.argv.includes("build")) {
  console.log(`[highlights] stored clip list: ${HIGHLIGHTS_DATA_URL || "Postgres (no repository known at build time)"}`);
}

const nextConfig: NextConfig = {
  // Inlined into the server build, so the address needs no setting on the host.
  // Left out when there is none, so the variable can still be set at run time.
  env: HIGHLIGHTS_DATA_URL ? { HIGHLIGHTS_DATA_URL } : {},
  // Also emit a self-contained server (.next/standalone). `prisma deploy`
  // ships that tree. Vercel and Netlify build their own output and ignore it,
  // and `next dev` is unaffected.
  output: "standalone",
  // Keep the image-optimisation binaries out of the standalone server. The app
  // renders plain <img> and never uses next/image, so they are ~33 MB of dead
  // weight in every deploy. Remove this if next/image is ever adopted.
  outputFileTracingExcludes: {
    "*": ["node_modules/@next/swc-*/**", "node_modules/sharp/**", "node_modules/@img/**"],
  },
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
