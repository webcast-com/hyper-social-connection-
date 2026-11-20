'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Crosshair, RefreshCw, Target, UserRound, Waypoints, X } from 'lucide-react';
import EspnResponseDetails from './EspnResponseDetails';
import { formatPredictionKickoff } from '@/lib/sports';
import { competitionCountry } from '@/lib/sports-navigation';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { teamHref, validEntityId } from '@/lib/espn-team';
import { validAthleteBoard, type AthleteBoard } from '@/lib/espn-athlete';
import { browserAthleteBoard } from '@/lib/espn-browser';
import { athleteHeadlines } from '@/lib/athlete-headline';

/**
 * One player's page: biography, team and the season statistics ESPN reports.
 *
 * Its own component in the same separate stack as the team page — nothing in the
 * leaders board, the match lineups or the highlights feed renders it, and it
 * renders none of them. They only agree on where a link points.
 *
 * Data arrives browser-first, exactly as the team page does: this reader's own
 * browser asks ESPN's site endpoint and, only if it must, the common endpoint,
 * and this site's own endpoint is asked when neither answered.
 *
 * Statistics are shown exactly as ESPN grouped and labelled them, bounded to a
 * few groups and a few rows, and a category that cannot be read is dropped
 * rather than padded. There is no sample biography: an unanswered request says
 * ESPN did not report this player, whichever route was used.
 *
 * The page is laid out as a player card (the portrait in a neon ring, the name,
 * and three figures picked by `athleteHeadlines`) with the full detail beside it
 * on a wide screen and under it on a narrow one. The card's lit background and
 * ring are in `player.css`, imported by the route; everything else is here.
 * The look is all that changed: what is asked of ESPN, and when, is as it was.
 */

/** Which route answered: both ask the same ESPN URL. */
const transportLabel = (transport: 'browser' | 'server' | undefined) =>
  transport === 'browser' ? 'Asked by this browser' : 'Asked by this site’s server';

const sections = [['overview', 'Overview'], ['stats', 'Season statistics']] as const;
type Section = typeof sections[number][0];

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-gray-300">{children}</p>;
}

/**
 * The portrait ladder used across the sports pages: photo, then initials. With
 * no player to name (still loading, or ESPN did not answer) the ring holds a
 * plain figure rather than a letter that would read as somebody's initial.
 */
function Portrait({ url, name }: { url: string | null; name: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return <span className="pl-portrait flex items-center justify-center text-5xl font-black tracking-tight text-white/85">
    {name === null ? <UserRound aria-hidden="true" className="h-20 w-20 text-white/25" strokeWidth={1.5} /> : url && !failed ? (
      // Provider CDN images load directly; the ring reserves the space.
      // eslint-disable-next-line @next/next/no-img-element -- provider photo, sized by the ring
      <img src={url} alt="" width={240} height={240} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    ) : <span aria-hidden="true">{initials || name.charAt(0)}</span>}
  </span>;
}

/** A team's crest beside its name. Reported by ESPN or absent; removed if it will not load. */
function Crest({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- provider crest, fixed size
  return <img src={url} alt="" width={28} height={28} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-7 w-7 shrink-0 object-contain" />;
}

function Facts({ facts }: { facts: [string, string | null][] }) {
  const shown = facts.filter(([, value]) => value !== null) as [string, string][];
  if (!shown.length) return <EmptySection>ESPN has not reported these details for this player.</EmptySection>;
  return <dl className="grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3">
    {shown.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-white">{value}</dd>
    </div>)}
  </dl>;
}

/** The icons over the card's three figures, by place. Decoration: the label says what each is. */
const TILE_ICONS = [Target, Waypoints, CalendarDays] as const;
const TILE_TINTS = ['text-lime-300', 'text-fuchsia-300', 'text-violet-300'] as const;

/** As many columns as there are figures, so one or two are not left in a third of the card. */
const TILE_COLUMNS = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'] as const;

const ROUND_BUTTON = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white outline-none transition hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-fuchsia-300 disabled:opacity-60';

export default function SportsAthleteDetails({ initial, reference, returnTo }: { initial: AthleteBoard; reference: { league: string; athleteId: string }; returnTo?: string }) {
  const [board, setBoard] = useState(initial);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(!initial.athlete);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<AthleteBoard['sources'] | null>(null);
  const request = useRef<AbortController | null>(null);
  const sectionId = useId();

  const refresh = async (force = false) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setLoading(true); setError('');
    try {
      // ESPN in this browser first, this site's endpoint when it could not reach.
      const next = await browserAthleteBoard(reference, controller.signal, force);
      if (!validAthleteBoard(next, reference)) throw new Error('Invalid player response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable' && board.athlete) {
        setFailure(next.sources);
        setError('Unable to update player details. Keeping the previous data. Please try again.');
      } else {
        setBoard(next);
        setFailure(null);
      }
    } catch {
      if (!controller.signal.aborted) setError('Could not load player details. Keeping the previous data. Please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    // Deferred so effect cleanup can prevent an obsolete or Strict Mode request.
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; request.current?.abort(); request.current = null; };
    // Load on mount and when navigating to a different player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.league, reference.athleteId]);

  const athlete = board.athlete;
  const sources = failure ?? board.sources;
  const team = athlete?.team ?? null;
  const teamLink = team?.id && validEntityId(team.id) ? teamHref({ league: reference.league, teamId: team.id }) : null;

  const headlines = athleteHeadlines(athlete, board.sport);
  const about = athlete
    ? [
        athlete.jersey ? `#${athlete.jersey}` : null,
        athlete.position,
        athlete.statusText,
        athlete.active === false ? 'Reported inactive' : null,
      ].filter(Boolean).join(' · ') || 'No position reported'
    : null;

  return <div className="mx-auto max-w-6xl p-3 text-white sm:p-5">
    <nav aria-label="Player navigation" className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-400">
      <span>{competitionCountry(reference.league) ?? 'Competition'}</span><span aria-hidden="true">/</span>
      <Link href={`/sports?league=${encodeURIComponent(reference.league)}`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold text-fuchsia-300 hover:underline">{board.leagueName}</Link>
      <span aria-hidden="true">/</span><span className="break-words">{athlete?.name ?? 'Player'}</span>
    </nav>

    {error && <p role="alert" className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* The player card. */}
      <header className="pl-card min-w-0 p-4 sm:p-5 lg:sticky lg:top-20">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-gray-100">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-fuchsia-400 shadow-[0_0_10px_2px_rgba(232,121,249,0.7)]" />
            <span className="truncate">ESPN · {board.leagueName}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => void refresh(true)} disabled={loading} title={loading ? 'Refreshing…' : 'Refresh details'} className={ROUND_BUTTON}>
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{loading ? 'Refreshing…' : 'Refresh details'}</span>
            </button>
            <Link href={safeSportsReturnPath(returnTo)} prefetch={false} aria-label="Back to sports scores" title="Back to sports scores" className={ROUND_BUTTON}>
              <X aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Where the player plays: "@ club", as the card's opening line. */}
        {team && <p className="mt-3 flex min-w-0 items-center gap-2 text-lg font-black uppercase tracking-wide sm:text-xl">
          <span aria-hidden="true" className="text-fuchsia-400">@</span>
          <Crest url={team.logo} />
          <span className="min-w-0 break-words">
            {teamLink
              ? <Link href={teamLink} prefetch={false} className="inline-flex min-h-11 items-center rounded outline-none hover:text-fuchsia-200 hover:underline focus-visible:ring-2 focus-visible:ring-fuchsia-300">{team.name}</Link>
              : <span>{team.name}</span>}
            {team.abbreviation ? <span className="text-sm font-bold text-gray-400"> · {team.abbreviation}</span> : null}
          </span>
        </p>}

        <div className="pl-stage mt-4">
          <span aria-hidden="true" className="pl-sparks" />
          <span aria-hidden="true" className="pl-ring pl-ring--glow" />
          <span aria-hidden="true" className="pl-ring" />
          <Portrait url={athlete?.headshot ?? null} name={athlete?.name ?? null} />
        </div>

        <h1 className="mt-5 break-words text-2xl font-black leading-tight sm:text-3xl">{athlete?.name ?? (loading ? 'Loading player details…' : 'Player details unavailable')}</h1>
        {about && <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-gray-300">
          <Crosshair aria-hidden="true" className="h-4 w-4 shrink-0 text-fuchsia-300" />
          <span className="min-w-0 break-words">{about}</span>
        </p>}

        {headlines.length > 0 && <dl aria-label="Key figures" className={`mt-5 grid min-w-0 gap-2 sm:gap-3 ${TILE_COLUMNS[Math.min(headlines.length, TILE_COLUMNS.length) - 1]}`}>
          {headlines.map((figure, index) => {
            const Icon = TILE_ICONS[index % TILE_ICONS.length];
            return <div key={`${figure.source}-${figure.label}`} className="flex min-w-0 flex-col items-center rounded-2xl border border-white/[0.07] bg-white/[0.05] px-2 py-3 text-center">
              <Icon aria-hidden="true" className={`h-4 w-4 ${TILE_TINTS[index % TILE_TINTS.length]}`} />
              {/* The label is ESPN's own; the figure leads, as on a card. */}
              <dt className="order-2 mt-0.5 w-full break-words text-[11px] font-semibold leading-tight text-gray-400">{figure.label}</dt>
              {/* A long figure (a height, a total with separators) is set smaller rather than broken mid-number. */}
              <dd className={`order-1 mt-1.5 w-full break-words font-black tabular-nums ${figure.value.length > 6 && headlines.length > 1 ? 'text-sm leading-tight sm:text-base' : 'text-xl leading-none sm:text-2xl'}`}>{figure.value}</dd>
            </div>;
          })}
        </dl>}
      </header>

      <div className="min-w-0">
        {!athlete ? <p role="status" className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          {loading ? 'Loading ESPN player details…'
            : sources.some((source) => source.httpStatus === 403) ? 'Access to ESPN player details was refused (HTTP 403).'
            : 'ESPN player details are currently unavailable.'}
          {' '}No sample biography or statistics are substituted.
        </p> : <>
          <div role="group" aria-label="Player detail sections" className="mb-3 flex min-w-0 gap-2 overflow-x-auto rounded-full border border-white/[0.07] bg-[#0f0b1c]/90 p-1.5">
            {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} aria-controls={sectionId} onClick={() => setSection(id)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-fuchsia-300 ${section === id ? 'bg-fuchsia-200 text-gray-950' : 'text-gray-200 hover:bg-white/[0.08]'}`}>{label}</button>)}
          </div>

          <section id={sectionId} aria-label={sections.find(([id]) => id === section)?.[1]} aria-busy={loading} className="min-w-0 rounded-3xl border border-white/[0.07] bg-white/[0.03] p-3 sm:p-5">
            <h2 className="mb-4 text-lg font-bold">{sections.find(([id]) => id === section)?.[1]}</h2>

            {section === 'overview' && <>
              <Facts facts={[
                ['Competition', board.leagueName],
                ['Team', team?.name ?? null],
                ['Position', athlete.position],
                ['Jersey', athlete.jersey],
                ['Age', athlete.age !== null ? `${athlete.age}` : null],
                ['Born', athlete.born],
                ['Height', athlete.height],
                ['Weight', athlete.weight],
                ['College', athlete.college],
                ['Nationality', athlete.nationality],
                ['Experience', athlete.experience],
                ['Status', athlete.statusText],
              ]} />
              {athlete.links.length > 0 && <div className="mt-5">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">On ESPN</h3>
                <ul className="flex min-w-0 flex-wrap gap-2">{athlete.links.map((link) => <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-fuchsia-200 outline-none transition hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-fuchsia-300">{link.label}</a>
                </li>)}</ul>
              </div>}
              <p className="mt-5 text-xs text-gray-400">
                {board.portraitsFromCdn
                  ? 'The portrait is the photo ESPN reported, or this player’s ESPN headshot where none was reported.'
                  : 'The portrait is the photo ESPN reported; none is synthesised for this competition, so initials are shown when ESPN reported no photo.'}
              </p>
            </>}

            {section === 'stats' && (athlete.statGroups.length ? <div className="space-y-5">
              {athlete.statGroups.map((group) => <div key={group.name} className="min-w-0">
                <h3 className="mb-2 break-words text-xs font-bold uppercase tracking-wide text-fuchsia-300">{group.name}</h3>
                <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {group.stats.map((stat) => <div key={stat.label} className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2">
                    <dt className="break-words text-[11px] font-semibold text-gray-400">{stat.label}</dt>
                    <dd className="break-words text-sm font-black tabular-nums text-white">{stat.value}</dd>
                  </div>)}
                </dl>
              </div>)}
              <p className="text-xs text-gray-400">Statistics are shown with ESPN’s own labels and grouping. A category ESPN did not report is absent rather than zero.</p>
            </div> : <EmptySection>ESPN has not reported season statistics for this player. Statistics coverage varies by sport and competition.</EmptySection>)}
          </section>
        </>}

        <p className="mt-4 text-xs text-gray-400">Only ESPN-reported data is shown. — means not reported. Statistics coverage varies by sport and competition.</p>
        <p className="mt-1 text-xs text-gray-400" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>

        <details className="mt-4 min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-gray-300">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">ESPN player feed details</summary>
          <ul className="mt-2 space-y-2">{sources.map((source) => <li key={source.url} className="min-w-0">
            <p className="break-words">{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}{source.error ? ` · ${source.error}` : ''}</p>
            <p className="break-words">{transportLabel(source.transport)}</p>
            <EspnResponseDetails metadata={source.responseMetadata} />
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-fuchsia-300 underline">{source.url}</a>
          </li>)}</ul>
        </details>
      </div>
    </div>
  </div>;
}
