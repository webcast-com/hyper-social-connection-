import type { Metadata } from 'next';
import { getSiteUrl, isPreviewDeployment } from './site-url';
import { SITE_DESCRIPTION } from './site-description';

/**
 * Complete per-page sharing metadata: Next replaces rather than merges OG/Twitter objects.
 *
 * `canonicalPath` points the canonical tag at another URL - used when a route
 * stays reachable but a different page owns the content (for example the
 * /sports/nba hand-off to the Basketball & NFL dashboard). `keywords` adds a
 * keyword list for crawlers that still read it.
 */
export function getPageMetadata({ title, description, path, index = true, type = 'website', canonicalPath, keywords }: {
  title: string; description: string; path: string; index?: boolean; type?: 'article' | 'website';
  canonicalPath?: string; keywords?: string[];
}): Metadata {
  const origin = getSiteUrl();
  const url = new URL(path, origin).toString();
  const canonical = canonicalPath ? new URL(canonicalPath, origin).toString() : url;
  const image = new URL('/og-image.png', origin).toString();
  return {
    title, description, ...(keywords?.length ? { keywords: keywords.join(', ') } : {}), alternates: { canonical },
    robots: { index: index && !isPreviewDeployment(), follow: true },
    openGraph: { type, title: `${title} | Hyper`, description, url, siteName: 'Hyper', images: [{ url: image, width: 1200, height: 630, alt: 'Hyper — Connect with the world' }] },
    twitter: { card: 'summary_large_image', title: `${title} | Hyper`, description, images: [image] },
  };
}

/** Homepage metadata and site identity stay aligned across search and sharing.
 * `keywords` carries the competition, team and player names the site covers. */
export function getHomeMetadata(keywords?: string[]): Metadata {
  const title = 'Hyper — Social Network, Communities & Sports';
  const description = SITE_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
    ...(keywords?.length ? { keywords: keywords.join(', ') } : {}),
    alternates: { canonical: '/' },
    openGraph: { title, description, url: '/', images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] },
  };
}

/** Site-name structured data is emitted only on the homepage. */
export function getWebsiteStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hyper',
    url: `${getSiteUrl()}/`,
  };
}
