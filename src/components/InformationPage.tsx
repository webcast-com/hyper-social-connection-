import Link from 'next/link';
import type { ReactNode } from 'react';

export default function InformationPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <article className="mx-auto max-w-3xl px-4 py-8 text-gray-900 sm:py-12 dark:text-gray-100">
    <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">← Back to Hyper</Link>
    <header className="mb-8 mt-3">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Hyper · hyper.co.ke</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-300">{intro}</p>
    </header>
    <div className="space-y-6 rounded-3xl border border-gray-200 bg-white p-5 text-sm leading-7 shadow-sm sm:p-8 dark:border-gray-700 dark:bg-gray-800 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400">{children}</div>
  </article>;
}
