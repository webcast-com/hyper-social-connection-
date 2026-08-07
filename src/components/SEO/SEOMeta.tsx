import type { Metadata } from 'next';

export const SITE_NAME = 'Hyper';
export const SITE_DESCRIPTION =
  'Connect with friends, discover communities, and share what matters on Hyper.';

/**
 * Shared site-level metadata. Route-specific pages can extend or override
 * these values with their own `metadata` export or `generateMetadata`.
 */
export function getSiteMetadata(siteUrl: string): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: 'Hyper — Connect with the world',
      template: '%s | Hyper',
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
      'Hyper',
      'social network',
      'connect with friends',
      'online communities',
      'discover people',
    ],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'social networking',
    alternates: {
      canonical: '/',
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: SITE_NAME,
      title: 'Hyper — Connect with the world',
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: 'summary',
      title: 'Hyper — Connect with the world',
      description: SITE_DESCRIPTION,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    formatDetection: {
      telephone: false,
    },
  };
}

/**
 * Kept as a compatibility component for callers that imported the old SEO
 * placeholder. The App Router Metadata API emits the actual tags.
 */
export default function SEOMeta() {
  return null;
}
