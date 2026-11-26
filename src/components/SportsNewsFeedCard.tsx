'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { SportsNewsArticle } from '@/lib/espn-news';
import { ShareContentSheet } from './ShareSheets';

const LEAGUE_CRESTS: Record<string, string> = {
  'nfl': 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  'nba': 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  'wnba': 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png',
  'mlb': 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  'nhl': 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  'epl': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
  'premier league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
  'english premier league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
  'ucl': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
  'uefa champions league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
  'champions league': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
  'laliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
  'la liga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
  'spanish laliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
  'serie a': 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
  'bundesliga': 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
  'ligue 1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
  'mls': 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png',
};

function leagueCrestFor(article: SportsNewsArticle): string | null {
  return (
    LEAGUE_CRESTS[article.league.toLowerCase()] ??
    LEAGUE_CRESTS[article.leagueName.toLowerCase()] ??
    null
  );
}

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

export default function SportsNewsFeedCard({
  article,
}: {
  article: SportsNewsArticle;
}) {
  const [showShare, setShowShare] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const published = formatPublished(article.published);
  const crest = !logoFailed ? leagueCrestFor(article) : null;

  return (
    <article className="overflow-hidden rounded-none sm:rounded-2xl border-y sm:border border-slate-200/80 bg-white shadow-none sm:shadow-sm transition-all hover:border-blue-300/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40">
      {/* Header with league crest */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80 dark:ring-white/10">
            {crest ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={crest}
                alt={article.leagueName}
                className="h-full w-full object-contain"
                loading="lazy"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="text-[10px] font-black tracking-tight text-slate-800">
                {article.leagueName
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 3)
                  .toUpperCase()}
              </span>
            )}
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
      </div>

      {/* Article body */}
      <div
        onClick={() => setExpanded((prev) => !prev)}
        className="group cursor-pointer"
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
          <h3 className="text-sm sm:text-base font-bold leading-snug text-slate-900 dark:text-white">
            {article.headline}
          </h3>
          {article.description && (
            <p
              className={`mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                expanded ? '' : 'line-clamp-3'
              }`}
            >
              {article.description}
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2 dark:border-slate-800 sm:px-4">
        <span className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {article.leagueName}
        </span>
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
            link: '/sports',
            text: `${article.headline} (${article.leagueName})`,
            feedHint: 'Share this story with your followers',
            image: article.image ?? undefined,
          }}
          compose={(note) =>
            [note.trim(), `${article.headline} — ${article.leagueName}`]
              .filter(Boolean)
              .join('\n')
          }
          onClose={() => setShowShare(false)}
        />
      )}
    </article>
  );
}
