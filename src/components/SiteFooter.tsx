import Link from 'next/link';

export default function SiteFooter() {
  return <footer className="mx-auto max-w-7xl border-t border-gray-200 px-4 pt-4 pb-[calc(var(--mobile-nav-space)+1rem)] text-sm text-gray-600 md:pb-6 dark:border-gray-700 dark:text-gray-300">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>Hyper · Connect with the world</p>
      <nav aria-label="About and privacy" className="flex flex-wrap gap-x-5">
        <Link href="/about" className="inline-flex min-h-11 items-center font-semibold text-blue-600 hover:underline dark:text-blue-400">About Hyper</Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-blue-600 hover:underline dark:text-blue-400">Privacy notice</Link>
      </nav>
    </div>
  </footer>;
}
