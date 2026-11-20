import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';

export const metadata: Metadata = getPageMetadata({
  title: 'Search',
  description: 'Search Hyper profiles and posts to find people and conversations.',
  path: '/search',
  // An empty query box until something is typed, and every result page
  // canonicalises here: reachable and followed, not indexed.
  index: false,
});

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
