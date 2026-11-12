'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import EspnResponseDetails from './EspnResponseDetails';
import { formatPredictionKickoff } from '@/lib/sports';
import { competitionCountry } from '@/lib/sports-navigation';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { teamHref, validEntityId } from '@/lib/espn-team';
import { validAthleteBoard, type AthleteBoard } from '@/lib/espn-athlete';
import { browserAthleteBoard } from '@/lib/espn-browser';

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
 */

/** Which route answered: both ask the same ESPN URL. */
const transportLabel = (transport: 'browser' | 'server' | undefined) =>
  transport === 'browser' ? 'Asked by this browser' : 'Asked by this site’s server';

const sections = [['overview', 'Overview'], ['stats', 'Season statistics']] as const;
type Section = typeof sections[number][0];

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">{children}</p>;
}

/** The portrait ladder used across the sports pages: photo, then initials. */
function Portrait({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-lg font-black text-gray-500 dark:bg-gray-700 dark:text-gray-200">
    {url && !failed ? (
      // Provider CDN images load directly; fixed dimensions reserve the space.
      // eslint-disable-next-line @next/next/no-img-element -- provider photo, sized by the header
      <img src={url} alt="" width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-20 w-20 object-cover" />
    ) : <span aria-hidden="true">{initials || name.charAt(0)}</span>}
  </span>;
}

function Facts({ facts }: { facts: [string, string | null][] }) {
  const shown = facts.filter(([, value]) => value !== null) as [string, string][];
  if (!shown.length) return <EmptySection>ESPN has not reported these details for this player.</EmptySection>;
  return <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
    {shown.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

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

  return <div className="mx-auto max-w-5xl p-3 text-gray-900 sm:p-5 dark:text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores</Link>
      <button type="button" onClick={() => void refresh(true)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh details'}</button>
    </div>

    {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

    <nav aria-label="Player navigation" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{competitionCountry(reference.league) ?? 'Competition'}</span><span aria-hidden="true">/</span>
      <Link href={`/sports?league=${encodeURIComponent(reference.league)}`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold text-blue-600 hover:underline dark:text-blue-400">{board.leagueName}</Link>
      <span aria-hidden="true">/</span><span className="break-words">{athlete?.name ?? 'Player'}</span>
    </nav>

    <header className="mb-5 min-w-0 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">ESPN · {board.leagueName}</p>
      <div className="mt-3 flex min-w-0 items-start gap-4">
        <Portrait url={athlete?.headshot ?? null} name={athlete?.name ?? 'Player'} />
        <div className="min-w-0">
          <h1 className="break-words text-xl font-black sm:text-3xl">{athlete?.name ?? (loading ? 'Loading player details…' : 'Player details unavailable')}</h1>
          {athlete && <p className="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">
            {[
              athlete.jersey ? `#${athlete.jersey}` : null,
              athlete.position,
              athlete.statusText,
              athlete.active === false ? 'Reported inactive' : null,
            ].filter(Boolean).join(' · ') || 'No position reported'}
          </p>}
          {team && <p className="mt-1 break-words text-sm">
            {teamLink
              ? <Link href={teamLink} prefetch={false} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{team.name}</Link>
              : <span className="font-semibold">{team.name}</span>}
            {team.abbreviation ? <span className="text-gray-500 dark:text-gray-400"> · {team.abbreviation}</span> : null}
          </p>}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Only ESPN-reported data is shown. — means not reported. Statistics coverage varies by sport and competition.</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>
    </header>

    {!athlete ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {loading ? 'Loading ESPN player details…'
        : sources.some((source) => source.httpStatus === 403) ? 'Access to ESPN player details was refused (HTTP 403).'
        : 'ESPN player details are currently unavailable.'}
      {' '}No sample biography or statistics are substituted.
    </p> : <>
      <div role="group" aria-label="Player detail sections" className="sticky top-16 z-20 mb-4 flex min-w-0 gap-2 overflow-x-auto rounded-2xl bg-gray-100 py-2 dark:bg-gray-900">
        {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} aria-controls={sectionId} onClick={() => setSection(id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${section === id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>{label}</button>)}
      </div>

      <section id={sectionId} aria-label={sections.find(([id]) => id === section)?.[1]} aria-busy={loading} className="min-w-0 rounded-3xl bg-white p-3 shadow-sm sm:p-5 dark:bg-gray-800">
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
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">On ESPN</h3>
            <ul className="flex min-w-0 flex-wrap gap-2">{athlete.links.map((link) => <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/60">{link.label}</a>
            </li>)}</ul>
          </div>}
          <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
            {board.portraitsFromCdn
              ? 'The portrait is the photo ESPN reported, or this player’s ESPN headshot where none was reported.'
              : 'The portrait is the photo ESPN reported; none is synthesised for this competition, so initials are shown when ESPN reported no photo.'}
          </p>
        </>}

        {section === 'stats' && (athlete.statGroups.length ? <div className="space-y-5">
          {athlete.statGroups.map((group) => <div key={group.name} className="min-w-0">
            <h3 className="mb-2 break-words text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">{group.name}</h3>
            <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.stats.map((stat) => <div key={stat.label} className="min-w-0 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900">
                <dt className="break-words text-[11px] font-semibold text-gray-500 dark:text-gray-400">{stat.label}</dt>
                <dd className="break-words text-sm font-black tabular-nums">{stat.value}</dd>
              </div>)}
            </dl>
          </div>)}
          <p className="text-xs text-gray-500 dark:text-gray-400">Statistics are shown with ESPN’s own labels and grouping. A category ESPN did not report is absent rather than zero.</p>
        </div> : <EmptySection>ESPN has not reported season statistics for this player. Statistics coverage varies by sport and competition.</EmptySection>)}
      </section>
    </>}

    <details className="mt-5 min-w-0 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN player feed details</summary>
      <ul className="mt-2 space-y-2">{sources.map((source) => <li key={source.url} className="min-w-0">
        <p className="break-words">{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}{source.error ? ` · ${source.error}` : ''}</p>
        <p className="break-words">{transportLabel(source.transport)}</p>
        <EspnResponseDetails metadata={source.responseMetadata} />
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-600 underline dark:text-blue-400">{source.url}</a>
      </li>)}</ul>
    </details>
  </div>;
}
