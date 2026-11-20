import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';

export const metadata: Metadata = getPageMetadata({
  title: 'Log in',
  description: 'Log in to your Hyper account and connect with your community.',
  path: '/login',
  // A form with nothing on it to rank: reachable and followed, not indexed.
  index: false,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
