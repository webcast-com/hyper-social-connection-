'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, Layers, Radio, RefreshCw, Trophy, TrendingUp, Zap } from 'lucide-react';
import type { SportsHeroFigures } from '@/lib/sports-hero';
import type { SportsBoard } from '@/lib/sports';

/**
 * The head and hero of the sports page, after the ScoreHub layout
 * (`scorehub/index.htm`): the brand bar with its section links, the strip of
 * sports, and the hero with its headline, two buttons, four figures and the
 * featured match.
 *
 * The layout is ScoreHub's; what it says is this page's. The original is a
 * static mock-up ("54 Matches Live Now", a hard-coded Arsenal v Chelsea), and
 * none of that is carried over:
 *
 *   - the section links go to pages that exist. ScoreHub's News, Teams and
 *     Stats have no page here and are not listed;
 *   - the strip of sports is the board's own sport filter, handed in by the
 *     board, so there is one filter and not two;
 *   - the figures come from `sportsHeroFigures`: counted, or a dash;
 *   - the featured match is drawn as the layout's own card
 *     (`SportsHeroFeatured`), from the board's fixtures, here instead of above
 *     the competitions. With nothing in play there is no card;
 *   - the theme toggle, bell and log-in button are left out: the site is
 *     dark-only and its own header carries the account controls.
 *
 * Everything is Tailwind, with no stylesheet of its own, so the look cannot
 * leak onto another page.
 */

/**
 * The accent. ScoreHub's own page (`scorehub/style.css`) uses a green; on the
 * board this panel wears the player page's palette with the rest of the page,
 * so the accent is that palette's fuchsia and the panel is its violet-black.
 */
const ACCENT = '#e879f9';

const SECTIONS: { label: string; href: string; current?: boolean; document?: boolean }[] = [
  { label: 'Scores', href: '/sports', current: true },
  { label: 'Live Streams', href: '/sports/live' },
  { label: 'Highlights', href: '/sports/highlights' },
  { label: 'Predictions', href: '/sports/predictions' },
  // These two are separate documents, not pages of this app: a full page load.
  { label: 'ScoreHub dashboard', href: '/scorehub', document: true },
  { label: 'Basketball & NFL dashboard', href: '/nfl-basketball/', document: true },
];

const FEED_TONE: Record<SportsBoard['mode'] | 'loading', string> = {
  live: 'border-[#86198f] text-[#f0abfc]',
  partial: 'border-amber-500/40 text-amber-300',
  demo: 'border-white/15 text-[#aab5c4]',
  loading: 'border-white/15 text-[#aab5c4]',
};

const dash = (value: number | null) => (value === null ? '—' : String(value));

export default function SportsScoreHero({
  figures, feedLabel, feedTone, feedTitle, refreshing, onRefresh, predictions = 0, status, onStatus, sportFilter, featured,
}: {
  figures: SportsHeroFigures;
  /** "Live feeds", "Partial feeds", "Sample board" or "Loading". */
  feedLabel: string;
  feedTone: SportsBoard['mode'] | 'loading';
  feedTitle?: string;
  refreshing: boolean;
  onRefresh: () => void;
  /** How many predictions the board holds; shown beside the link when there are any. */
  predictions?: number;
  /** The board's status filter, so the hero's two buttons show which is on. */
  status: string;
  onStatus: (status: 'live' | 'upcoming') => void;
  /** The board's sport filter, drawn as the strip under the brand bar. */
  sportFilter: ReactNode;
  /** The board's featured match, or nothing when no match is in play. */
  featured?: ReactNode;
}) {
  const link = 'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#e879f9]';
  const tiles: { label: string; value: string; icon: ReactNode; tint: string }[] = [
    { label: 'Live', value: dash(figures.live), icon: <Radio aria-hidden="true" className="h-3.5 w-3.5" />, tint: 'bg-[#4b1d32] text-[#ff5974]' },
    { label: 'Sports', value: String(figures.sports), icon: <Layers aria-hidden="true" className="h-3.5 w-3.5" />, tint: 'bg-[#4a044e] text-[#f0abfc]' },
    { label: 'Leagues', value: String(figures.competitions), icon: <Trophy aria-hidden="true" className="h-3.5 w-3.5" />, tint: 'bg-[#1a2e05] text-[#bef264]' },
    { label: 'Matches', value: dash(figures.matches), icon: <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />, tint: 'bg-[#2e1065] text-[#c4b5fd]' },
  ];

  return (
    <section aria-label="ScoreHub" className="mb-4 min-w-0 overflow-hidden rounded-2xl border border-[#2a2440] bg-[#0b0915] text-[#f4f7fb]">
      {/* The brand bar. On a phone the section links drop to a row of their own. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 border-b border-[#221c36] bg-[#08070f] px-3 sm:px-4">
        <p className="flex min-h-14 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#e879f9] to-[#7c3aed] text-white shadow-[0_0_18px_rgba(168,85,247,0.3)]"><ArrowUpRight className="h-5 w-5" strokeWidth={3} /></span>
          <span className="leading-tight">
            <b className="block text-base font-extrabold tracking-tight">Score<span style={{ color: ACCENT }}>Hub</span></b>
            {/* Left out on the narrowest phones, where it would push the controls onto a second row. */}
            <small className="block text-[10px] text-[#aab5c4] max-[379px]:hidden">Every Score. Every Moment.</small>
          </span>
        </p>

        <nav aria-label="Sports sections" className="order-last -mx-3 flex w-[calc(100%+1.5rem)] min-w-0 gap-4 overflow-x-auto border-t border-[#221c36] px-3 [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:border-t-0 lg:px-0">
          {SECTIONS.map((section) => {
            const className = `${link} ${section.current ? 'border-[#e879f9] font-bold text-[#f0abfc]' : 'border-transparent text-[#d0d8e2] hover:text-white'}`;
            const label = <>
              {section.label}
              {section.href === '/sports/predictions' && predictions > 0 && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">{predictions}</span>}
            </>;
            return section.document
              // A plain anchor: a separate document, not a page of this app.
              ? <a key={section.href} href={section.href} className={className}>{label}</a>
              : <Link key={section.href} href={section.href} prefetch={false} aria-current={section.current ? 'page' : undefined} className={className}>{label}</Link>;
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span title={feedTitle} className={`whitespace-nowrap rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide sm:px-2.5 sm:text-[11px] ${FEED_TONE[feedTone]}`}>{feedLabel}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing} title={refreshing ? 'Refreshing scores…' : 'Refresh scores'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-[#2e2748] bg-[#17122a] px-3 text-xs font-bold text-[#e0e8f2] outline-none transition-colors hover:bg-[#1e1836] focus-visible:ring-2 focus-visible:ring-[#e879f9] disabled:opacity-60">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="sr-only sm:not-sr-only">{refreshing ? 'Refreshing scores…' : 'Refresh scores'}</span>
          </button>
        </div>
      </div>

      {/* The strip of sports: the board's own filter. */}
      <div className="min-w-0 overflow-x-auto border-b border-[#221c36] bg-[#0d0a1a] px-3 [scrollbar-width:none] sm:px-4">{sportFilter}</div>

      {/* The hero. The photograph is decoration behind the gradients that keep the text readable. */}
      <div
        className={`relative grid min-w-0 items-center gap-5 bg-cover bg-center px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:gap-7 lg:px-8 ${featured ? 'md:grid-cols-[1.18fr_1fr]' : ''}`}
        style={{ backgroundImage: 'linear-gradient(120deg,rgba(168,85,247,0.30) 0%,rgba(255,61,242,0.10) 100%),linear-gradient(90deg,#0b0915 0%,rgba(11,9,21,0.85) 28%,rgba(11,9,21,0.25) 68%,rgba(11,9,21,0.6) 100%),linear-gradient(0deg,#0b0915 0%,transparent 55%),url(/sports/hero-scores.webp)' }}
      >
        <div className="min-w-0">
          <p className={`inline-flex max-w-full items-center gap-2 rounded-lg border bg-[#1a1430]/85 px-3 py-1.5 text-xs ${figures.inPlay ? 'border-[#723b31] text-[#f4e9eb] shadow-[0_4px_20px_rgba(255,75,52,0.11)]' : 'border-white/15 text-[#bdc7d5]'}`}>
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${figures.inPlay ? 'animate-pulse bg-[#ff4058] shadow-[0_0_8px_#ff304b]' : 'bg-[#5b6879]'}`} />
            <span className={`min-w-0 truncate ${figures.inPlay ? 'font-bold' : ''}`}>{figures.headline}</span>
          </p>
          <h1 className="mt-3.5 text-[2.1rem] font-black leading-[1.02] tracking-tight sm:text-[2.7rem]">
            Every Score.<br />
            <span style={{ color: ACCENT }}>Every Moment.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#bdc7d5]">
            {/* A phone gets the short line only, so the scores start sooner. */}
            <span className="hidden sm:inline">Live scores, fixtures and results from your favourite leagues and teams. </span>
            Worldwide scores and fixtures from ESPN.
          </p>
          <div className="mt-4 flex min-w-0 flex-wrap gap-2 sm:gap-2.5">
            <button type="button" aria-pressed={status === 'live'} onClick={() => onStatus('live')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#f0abfc] to-[#e879f9] px-3.5 text-sm sm:px-4 font-bold text-[#2a0a33] shadow-[0_5px_20px_rgba(232,121,249,0.18)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white">
              <Zap aria-hidden="true" className="h-4 w-4" />Live Scores
            </button>
            <button type="button" aria-pressed={status === 'upcoming'} onClick={() => onStatus('upcoming')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#4a4268] bg-[#120d22]/80 px-3.5 text-sm sm:px-4 font-bold outline-none transition hover:bg-[#1e1836] focus-visible:ring-2 focus-visible:ring-[#e879f9]">
              <CalendarDays aria-hidden="true" className="h-4 w-4" />Upcoming Fixtures
            </button>
          </div>
          <dl aria-label="At a glance" className="mt-4 grid max-w-[31rem] grid-cols-4 overflow-hidden rounded-lg border border-[#3a3352] bg-[#0f0b1c]/80">
            {tiles.map((tile) => (
              <div key={tile.label} className="flex min-w-0 flex-col items-center gap-1 border-r border-[#2a2440] px-1 py-2.5 text-center last:border-r-0 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-2 lg:gap-y-0 lg:px-2.5 lg:text-left">
                <span className={`order-1 grid h-6 w-6 shrink-0 place-items-center rounded-md lg:row-span-2 lg:self-center ${tile.tint}`}>{tile.icon}</span>
                {/* The figure leads, as in the layout; the label is still its term. */}
                <dt className="order-3 w-full min-w-0 truncate text-[9px] font-semibold uppercase tracking-wide text-[#94a2b4] sm:text-[10px] lg:col-start-2 lg:row-start-2">{tile.label}</dt>
                <dd className="order-2 text-sm font-bold tabular-nums lg:col-start-2 lg:row-start-1">{tile.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {featured && <div className="min-w-0 [&>section]:mb-0">{featured}</div>}
      </div>
    </section>
  );
}
