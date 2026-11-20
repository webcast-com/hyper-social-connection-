import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';

export const metadata: Metadata = getPageMetadata({
  title: 'Create an account',
  description: 'Create a Hyper account to connect with friends, share posts and join communities.',
  path: '/signup',
  // A form with nothing on it to rank: reachable and followed, not indexed.
  index: false,
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
