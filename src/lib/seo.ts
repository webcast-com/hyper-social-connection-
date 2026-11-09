import type { Metadata } from 'next';
import { getSiteUrl, isPreviewDeployment } from './site-url';
import { SITE_DESCRIPTION } from './site-description';

/** Complete per-page sharing metadata: Next replaces rather than merges OG/Twitter objects. */
export function getPageMetadata({ title, description, path, index = true, type = 'website' }: {
  title: string; description: string; path: string; index?: boolean; type?: 'website' | 'article';
}): Metadata {
  const origin = getSiteUrl();
  const url = new URL(path, origin).toString();
  const image = new URL('/og-image.png', origin).toString();
  return {
    title, description, alternates: { canonical: url },
    robots: { index: index && !isPreviewDeployment(), follow: true },
    openGraph: { type, title: `${title} | Hyper`, description, url, siteName: 'Hyper', images: [{ url: image, width: 1200, height: 630, alt: 'Hyper — Connect with the world' }] },
    twitter: { card: 'summary_large_image', title: `${title} | Hyper`, description, images: [image] },
  };
}

/** Homepage metadata and site identity stay aligned across search and sharing. */
export function getHomeMetadata(): Metadata {
  const title = 'Hyper — Social Network, Communities & Sports';
  const description = SITE_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
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
