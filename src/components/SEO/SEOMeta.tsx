import type { Metadata } from 'next';
import { isPreviewDeployment } from '@/lib/site-url';
import { SITE_DESCRIPTION } from '@/lib/site-description';

export const SITE_NAME = 'Hyper';
export { SITE_DESCRIPTION } from '@/lib/site-description';

/**
 * Shared site-level metadata. Route-specific pages can extend or override
 * these values with their own `metadata` export or `generateMetadata`.
 */
export function getSiteMetadata(siteUrl: string): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    verification: {
      google: '0_cko3izuhuWqNHJ2touhJTuXeoA2Kuxtbe4A8vXIwc',
    },
    title: {
      default: 'Hyper — Social Network, Communities & Sports',
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
      'sports scores',
      'football',
      'NBA',
      'NFL',
      'rugby',
    ],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'social networking',
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: SITE_NAME,
      title: 'Hyper — Social Network, Communities & Sports',
      description: SITE_DESCRIPTION,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Hyper — Connect with the world',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Hyper — Social Network, Communities & Sports',
      description: SITE_DESCRIPTION,
      images: ['/og-image.png'],
    },
    robots: {
      index: !isPreviewDeployment(),
      follow: true,
      googleBot: {
        index: !isPreviewDeployment(),
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
