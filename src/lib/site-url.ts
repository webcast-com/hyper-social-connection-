/** Production canonical origin; never infer SEO URLs from a preview host. */
export const PRODUCTION_SITE_URL = 'https://hyper.co.ke';

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return PRODUCTION_SITE_URL;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return PRODUCTION_SITE_URL;
    // Ignore legacy deployment aliases and preview hosts even if an old
    // environment variable still names one. They are not the public origin.
    if (url.hostname.endsWith('.vercel.app') || url.hostname.endsWith('.e2b.app')) return PRODUCTION_SITE_URL;
    // The public site always uses HTTPS and the apex hostname.
    if (url.hostname === 'hyper.co.ke' || url.hostname === 'www.hyper.co.ke') return PRODUCTION_SITE_URL;
    return url.origin;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development';
}
