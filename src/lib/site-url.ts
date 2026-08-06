/**
 * Resolves the canonical site origin for this deployment.
 *
 * Order of precedence:
 *   1. NEXT_PUBLIC_SITE_URL (explicit, e.g. https://hyper.example.com)
 *   2. VERCEL_URL (deployed preview/production on Vercel)
 *   3. http://localhost:3000 (local dev / offline preview)
 *
 * Used by the sitemap, robots.txt and the OAuth email redirect.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
