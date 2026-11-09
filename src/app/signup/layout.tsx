import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';

export const metadata: Metadata = getPageMetadata({
  title: 'Create an account',
  description: 'Create a Hyper account to connect with friends, share posts and join communities.',
  path: '/signup',
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
