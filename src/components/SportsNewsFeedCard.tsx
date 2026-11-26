'use client';

import { useState } from 'react';
import { ExternalLink, Newspaper, Share2 } from 'lucide-react';
import type { SportsNewsArticle } from '@/lib/espn-news';
import { ShareContentSheet } from './ShareSheets';

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

export default function SportsNewsFeedCard({
  article,
}: {
  article: SportsNewsArticle;
}) {
  const [showShare, setShowShare] = useState(false);
  const published = formatPublished(article.published);

  return (
    <article className="overflow-hidden rounded-none sm:rounded-2xl border-y sm:border border-slate-200/80 bg-white shadow-none sm:shadow-sm transition-all hover:border-blue-300/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Newspaper className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {article.leagueName}
              </span>
              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                News
              </span>
            </div>
            {published && (
              <p className="truncate text-[10.5px] text-slate-500 dark:text-slate-400" suppressHydrationWarning>
                {published}
              </p>
            )}
          </div>
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Read ${article.headline} on ESPN`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
        >
          <span>ESPN</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Article link body */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {article.image && (
          <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.image}
              alt={article.headline}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        )}
        <div className="px-3.5 py-3 sm:px-4">
          <h3 className="text-sm sm:text-base font-bold leading-snug text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
            {article.headline}
          </h3>
          {article.description && (
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {article.description}
            </p>
          )}
        </div>
      </a>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2 dark:border-slate-800 sm:px-4">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          <span>Read full story</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={() => setShowShare(true)}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
        </button>
      </div>

      {showShare && (
        <ShareContentSheet
          subject={{
            noun: 'article',
            title: article.headline,
            subtitle: article.leagueName,
            link: article.url,
            text: `${article.headline} (${article.leagueName})`,
            feedHint: 'Share this story with your followers',
            image: article.image ?? undefined,
          }}
          compose={(note) =>
            [note.trim(), `${article.headline} — ${article.leagueName}`, article.url]
              .filter(Boolean)
              .join('\n')
          }
          onClose={() => setShowShare(false)}
        />
      )}
    </article>
  );
}
