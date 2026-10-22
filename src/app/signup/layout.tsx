import type { Metadata } from 'next';
import { getPageMetadata } from '@/lib/seo';

export const metadata: Metadata = getPageMetadata({
  title: 'Create an account',
  description: 'Join Hyper to connect with friends and discover communities.',
  path: '/signup',
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
