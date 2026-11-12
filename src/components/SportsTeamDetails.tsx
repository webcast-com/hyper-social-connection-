'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import EspnResponseDetails from './EspnResponseDetails';
import { formatPredictionKickoff } from '@/lib/sports';
import { competitionCountry } from '@/lib/sports-navigation';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { matchHref } from '@/lib/espn-match';
import { athleteHref } from '@/lib/espn-athlete';
import { teamHref, validEntityId, validTeamBoard, type TeamBoard, type TeamFixture, type TeamRosterEntry, type TeamSide } from '@/lib/espn-team';

/**
 * One team's page: identity, fixtures and squad.
 *
 * Its own component in the team detail stack — it does not render through the
 * match details card, the league table or the leaders board, and none of them
 * render it. The only thing they share is where a link points.
 *
 * Data arrives from this site's own endpoint rather than a direct browser call
 * to ESPN, so the server feed owns the cache, the timeout and the honest
 * reporting of which part of the page ESPN answered. The board is validated
 * before it replaces what is on screen, a failed refresh keeps the previous
 * data, and nothing here substitutes a sample squad: when ESPN does not report
 * a part, that part says so.
 */

const sections = [['overview', 'Overview'], ['fixtures', 'Fixtures & results'], ['squad', 'Squad']] as const;
type Section = typeof sections[number][0];

/** How many fixtures are listed per group; the board itself is bounded at 60. */
const LISTED = 20;

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">{children}</p>;
}

/** Provider crest, else the club's own initials. A crest is never synthesised. */
function Crest({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-500 dark:bg-gray-700 dark:text-gray-200">
    {url && !failed ? (
      // Provider CDN images load directly; fixed dimensions reserve the space.
      // eslint-disable-next-line @next/next/no-img-element -- provider crest, sized by the card
      <img src={url} alt="" width={56} height={56} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-14 w-14 rounded-full object-contain" />
    ) : <span>{initials || name.charAt(0)}</span>}
  </span>;
}

/** The portrait ladder used across the sports pages: photo, then initials. */
function Portrait({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- provider photo, sized by the row
    <img src={url} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-gray-700" />
  ) : (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
      {initials || name.charAt(0)}
    </span>
  );
}

function Facts({ facts }: { facts: [string, string | null][] }) {
  const shown = facts.filter(([, value]) => value !== null) as [string, string][];
  if (!shown.length) return <EmptySection>ESPN has not reported these details for this team.</EmptySection>;
  return <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
    {shown.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

/** A side of a fixture: linked to its own team page only when ESPN gave an id. */
function SideName({ side, league }: { side: TeamSide; league: string }) {
  const label = side.abbreviation && side.abbreviation !== side.name ? `${side.name} (${side.abbreviation})` : side.name;
  return side.id && validEntityId(side.id)
    ? <Link href={teamHref({ league, teamId: side.id })} prefetch={false} className="break-words font-semibold text-blue-600 hover:underline dark:text-blue-400">{label}</Link>
    : <span className="break-words font-semibold">{label}</span>;
}

function FixtureRow({ fixture, league, showScore }: { fixture: TeamFixture; league: string; showScore: boolean }) {
  const sides = [fixture.home, fixture.away].filter((side): side is TeamSide => !!side);
  return <li className="min-w-0 border-t border-gray-100 py-3 first:border-t-0 dark:border-gray-700">
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <Link href={matchHref({ league, eventId: fixture.id })} prefetch={false} className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm hover:underline">
        {sides.length === 2 ? <span className="min-w-0 break-words"><SideName side={sides[0]} league={league} /> <span className="text-gray-400">v</span> <SideName side={sides[1]} league={league} /></span>
          : <span className="min-w-0 break-words">{fixture.opponent ? <>vs <SideName side={fixture.opponent} league={league} /></> : 'Opponent not reported'}</span>}
      </Link>
      {showScore && <span className="shrink-0 text-sm font-black tabular-nums">{sides.map((side) => side.score ?? '—').join(' – ')}</span>}
    </div>
    <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
      {formatPredictionKickoff(fixture.date)}
      {[fixture.statusText, fixture.competition, fixture.venue].filter(Boolean).map((part) => ` · ${part}`).join('')}
    </p>
  </li>;
}

function SquadRow({ person, league }: { person: TeamRosterEntry; league: string }) {
  const details = [
    person.age !== null ? `${person.age} yrs` : null,
    person.height ? `${person.height} height` : null,
    person.weight ? `${person.weight} weight` : null,
    person.experience,
    person.nationality,
    person.born ? `Born ${person.born}` : null,
  ].filter(Boolean);
  return <li className="flex min-w-0 items-center gap-3 border-t border-gray-100 py-2 first:border-t-0 dark:border-gray-700">
    <Portrait url={person.headshot} name={person.name} />
    <span className="w-7 shrink-0 text-sm text-gray-500 tabular-nums">{person.jersey ?? '—'}</span>
    <span className="min-w-0 flex-1">
      {person.id && validEntityId(person.id)
        ? <Link href={athleteHref({ league, athleteId: person.id })} prefetch={false} className="inline-flex min-h-11 min-w-0 items-center text-sm font-semibold break-words text-blue-600 hover:underline dark:text-blue-400">{person.name}</Link>
        : <span className="block break-words text-sm font-semibold">{person.name}</span>}
      <span className="block break-words text-xs text-gray-500 dark:text-gray-400">
        {[person.position, ...details].filter(Boolean).join(' · ') || 'Details not reported'}
      </span>
    </span>
  </li>;
}

export default function SportsTeamDetails({ initial, reference, returnTo }: { initial: TeamBoard; reference: { league: string; teamId: string }; returnTo?: string }) {
  const [board, setBoard] = useState(initial);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(!initial.team);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<TeamBoard['sources'] | null>(null);
  const request = useRef<AbortController | null>(null);
  const sectionId = useId();

  const refresh = async (force = false) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/sports/teams/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.teamId)}${force ? '?refresh=1' : ''}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Team details HTTP ${response.status}`);
      const next = await response.json() as TeamBoard;
      if (!validTeamBoard(next, reference)) throw new Error('Invalid team response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable' && board.team) {
        setFailure(next.sources);
        setError('Unable to update team details. Keeping the previous data. Please try again.');
      } else {
        setBoard(next);
        setFailure(null);
      }
    } catch {
      if (!controller.signal.aborted) setError('Could not load team details. Keeping the previous data. Please try again.');
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
    // Load on mount and when navigating to a different team.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.league, reference.teamId]);

  const team = board.team;
  const sources = failure ?? board.sources;
  const missing = sources.filter((source) => !source.ok).map((source) => source.part);
  const results = board.fixtures.filter((fixture) => fixture.state === 'post')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const upcoming = board.fixtures.filter((fixture) => fixture.state !== 'post')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const nextFixture = upcoming[0] ?? null;
  const lastResult = results[0] ?? null;
  const partLabel = (part: string) => part === 'info' ? 'team identity' : part === 'schedule' ? 'fixtures' : 'the squad';

  return <div className="mx-auto max-w-5xl p-3 text-gray-900 sm:p-5 dark:text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores</Link>
      <button type="button" onClick={() => void refresh(true)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh details'}</button>
    </div>

    {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

    <nav aria-label="Team navigation" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{competitionCountry(reference.league) ?? 'Competition'}</span><span aria-hidden="true">/</span>
      <Link href={`/sports?league=${encodeURIComponent(reference.league)}`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold text-blue-600 hover:underline dark:text-blue-400">{board.leagueName}</Link>
      <span aria-hidden="true">/</span><span className="break-words">{team?.name ?? 'Team'}</span>
    </nav>

    <header className="mb-5 min-w-0 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">ESPN · {board.leagueName}</p>
      <div className="mt-3 flex min-w-0 items-start gap-4">
        <Crest url={team?.logo ?? null} name={team?.name ?? 'Team'} />
        <div className="min-w-0">
          <h1 className="break-words text-xl font-black sm:text-3xl">{team?.name ?? (loading ? 'Loading team details…' : 'Team details unavailable')}</h1>
          {team && <p className="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">
            {[team.standing, team.record ? `Record ${team.record}` : null, team.abbreviation, team.active === false ? 'Reported inactive' : null].filter(Boolean).join(' · ') || 'No record reported yet'}
          </p>}
          {team?.venue && <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-400">{team.venue}</p>}
        </div>
      </div>
      {team && (team.colours.primary || team.colours.secondary) && (
        <div className="mt-4 flex items-center gap-2">
          {[team.colours.primary, team.colours.secondary].filter(Boolean).map((value) => (
            <span key={value} aria-label={`Reported club colour ${value}`} className="h-3 w-10 rounded-full ring-1 ring-black/10" style={{ backgroundColor: value as string }} />
          ))}
          <span className="text-xs text-gray-500 dark:text-gray-400">Reported club colours</span>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Only ESPN-reported data is shown. — means not reported. Coverage varies by sport and competition.</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>
    </header>

    {!team ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {loading ? 'Loading ESPN team details…'
        : sources.some((source) => source.httpStatus === 403) ? 'Access to ESPN team details was refused (HTTP 403).'
        : 'ESPN team details are currently unavailable.'}
      {' '}No sample squad, record or fixtures are substituted.
    </p> : <>
      <div role="group" aria-label="Team detail sections" className="sticky top-16 z-20 mb-4 flex min-w-0 gap-2 overflow-x-auto rounded-2xl bg-gray-100 py-2 dark:bg-gray-900">
        {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} aria-controls={sectionId} onClick={() => setSection(id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${section === id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>{label}</button>)}
      </div>

      <section id={sectionId} aria-label={sections.find(([id]) => id === section)?.[1]} aria-busy={loading} className="min-w-0 rounded-3xl bg-white p-3 shadow-sm sm:p-5 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-bold">{sections.find(([id]) => id === section)?.[1]}</h2>
        {missing.length > 0 && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">ESPN did not answer for {missing.map(partLabel).join(' or ')}. What is shown below is what was reported.</p>}

        {section === 'overview' && <>
          <Facts facts={[
            ['Competition', board.leagueName],
            ['Record', team.record],
            ['Standing', team.standing],
            ['Code', team.abbreviation],
            ['Venue', team.venue],
            ['Status', team.active === null ? null : team.active ? 'Active' : 'Inactive'],
          ]} />
          {(nextFixture || lastResult) && <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {nextFixture && <article className="min-w-0 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Next reported fixture</h3>
              <ul className="mt-2"><FixtureRow fixture={nextFixture} league={reference.league} showScore={false} /></ul>
            </article>}
            {lastResult && <article className="min-w-0 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Last reported result</h3>
              <ul className="mt-2"><FixtureRow fixture={lastResult} league={reference.league} showScore /></ul>
            </article>}
          </div>}
          {team.links.length > 0 && <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">On ESPN</h3>
            <ul className="flex min-w-0 flex-wrap gap-2">{team.links.map((link) => <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/60">{link.label}</a>
            </li>)}</ul>
          </div>}
        </>}

        {section === 'fixtures' && (board.fixtures.length ? <>
          {upcoming.length > 0 && <div className="mb-5 min-w-0">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Upcoming</h3>
            <ul className="min-w-0">{upcoming.slice(0, LISTED).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} league={reference.league} showScore={false} />)}</ul>
            {upcoming.length > LISTED && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{upcoming.length - LISTED} further reported fixtures are not listed.</p>}
          </div>}
          {results.length > 0 && <div className="min-w-0">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Results</h3>
            <ul className="min-w-0">{results.slice(0, LISTED).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} league={reference.league} showScore />)}</ul>
            {results.length > LISTED && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{results.length - LISTED} further reported results are not listed.</p>}
          </div>}
          {!upcoming.length && !results.length && <EmptySection>ESPN reported fixtures for this team without a state, so none can be listed as upcoming or finished.</EmptySection>}
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Fixtures are grouped by the state ESPN reports, not by comparing dates with the clock, so a postponed match is never relabelled as a result.</p>
        </> : <EmptySection>ESPN has not reported fixtures for this team. Schedules are published for some competitions and not others.</EmptySection>)}

        {section === 'squad' && (board.roster.length ? <>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Reported squad: {board.roster.length} {board.roster.length === 1 ? 'player' : 'players'}. Portraits are the photos ESPN reported{board.portraitsFromCdn ? ', or this player’s ESPN headshot for the NBA and NFL' : ', and are not synthesised for this competition'}; initials are shown when none was reported.</p>
          <ul className="min-w-0">{board.roster.map((person, index) => <SquadRow key={person.id ?? `${person.name}-${index}`} person={person} league={reference.league} />)}</ul>
        </> : <EmptySection>ESPN has not reported a squad for this team. Rosters are published for some competitions and not others.</EmptySection>)}
      </section>
    </>}

    <details className="mt-5 min-w-0 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN team feed details</summary>
      <ul className="mt-2 space-y-2">{sources.map((source) => <li key={`${source.part}-${source.url}`} className="min-w-0">
        <p className="break-words font-semibold capitalize">{partLabel(source.part)}: {source.ok ? 'reported' : 'not reported'}</p>
        <p className="break-words">{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}{source.error ? ` · ${source.error}` : ''}</p>
        <EspnResponseDetails metadata={source.responseMetadata} />
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-600 underline dark:text-blue-400">{source.url}</a>
      </li>)}</ul>
    </details>
  </div>;
}
