'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import EspnResponseDetails from './EspnResponseDetails';
import { SportsLeagueTable } from './SportsLeagueTable';
import { formatPredictionKickoff } from '@/lib/sports';
import { competitionCountry, statisticShare } from '@/lib/sports-navigation';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import type { MatchBoard, MatchLineup } from '@/lib/espn-match';

const sections = [['statistics', 'Statistics'], ['lineups', 'Lineups & rosters'], ['players', 'Player stats'], ['events', 'Match events'], ['table', 'League table']] as const;
type Section = typeof sections[number][0];
function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">{children}</p>;
}
function Lineup({ lineup, name }: { lineup: MatchLineup; name: string }) {
  return <article className="min-w-0 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
    <h3 className="break-words font-bold">{name}</h3>
    {lineup.formation && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Reported formation: {lineup.formation}</p>}
    {([[true, 'Starters'], [false, 'Non-starters'], [null, 'Listed players']] as const).map(([starter, label]) => {
      const people = lineup.players.filter((person) => person.starter === starter);
      return people.length ? <div key={label} className="mt-4"><h4 className="mb-2 text-xs font-bold uppercase text-blue-600 dark:text-blue-400">{label}</h4>
        <ul className="space-y-2">{people.map((person) => <li key={person.id} className="flex min-w-0 gap-2 text-sm">
          <span className="w-7 shrink-0 text-gray-500">{person.jersey ?? '—'}</span>
          <span className="min-w-0 break-words">{person.name}{person.position && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{person.position}</span>}{person.didNotPlay && <span className="ml-2 text-xs text-gray-500">Did not play</span>}</span>
        </li>)}</ul>
      </div> : null;
    })}
  </article>;
}

export default function SportsMatchDetails({ initial, reference, returnTo }: { initial: MatchBoard; reference: { league: string; eventId: string }; returnTo?: string }) {
  const [board, setBoard] = useState(initial);
  const [section, setSection] = useState<Section>('statistics');
  const [tableOpened, setTableOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<MatchBoard['source'] | null>(null);
  const request = useRef<AbortController | null>(null);
  const sectionId = useId();
  useEffect(() => () => { request.current?.abort(); }, []);
  const refresh = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/sports/matches/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.eventId)}?refresh=1`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Match request failed');
      const next = await response.json() as MatchBoard;
      if (!['ready', 'unavailable'].includes(next.status) || !next.source || typeof next.source.ok !== 'boolean'
        || typeof next.source.url !== 'string' || (next.status === 'unavailable' && next.match !== null)
        || (next.status === 'ready' && (!next.match || next.match.reference?.eventId !== reference.eventId || next.match.reference?.league !== reference.league
          || !['teams', 'statistics', 'lineups', 'playerStats', 'updates'].every((key) => Array.isArray(next.match?.[key as keyof typeof next.match]))))) throw new Error('Invalid match response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable' && board.match) { setFailure(next.source); setError('Unable to update match details. Keeping the previous data. Please try again.'); }
      else { setBoard(next); setFailure(null); }
    } catch {
      if (!controller.signal.aborted) setError('Could not refresh match details. Keeping the previous data. Please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  const match = board.match;
  const source = failure ?? board.source;
  const teamName = (id: string) => match?.teams.find((team) => team.id === id)?.name ?? 'Team';
  return <div className="mx-auto max-w-5xl p-3 text-gray-900 sm:p-5 dark:text-white">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores</Link>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh details'}</button>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <nav aria-label="Match navigation" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{competitionCountry(reference.league) ?? 'Competition'}</span><span aria-hidden="true">/</span>
      <Link href={`/sports?league=${encodeURIComponent(reference.league)}`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold text-blue-600 hover:underline dark:text-blue-400">{match?.leagueName ?? 'Browse this competition'}</Link>
    </nav>
    <header className="mb-5 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">ESPN · {match?.leagueName ?? 'Match details'}</p>
      <h1 className="mt-2 break-words text-xl font-black sm:text-3xl">{match?.title ?? 'Match details unavailable'}</h1>
      {match && <>
        <p className="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">{match.statusText ?? 'Status not reported'}{match.kickoff ? ` · ${formatPredictionKickoff(match.kickoff)}` : ''}</p>
        {match.venue && <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-400">{match.venue}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">{match.teams.map((team) => <div key={team.id} className="min-w-0 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
          <p className="break-words text-sm font-bold">{team.name}</p>
          {team.side && <p className="text-xs capitalize text-gray-500 dark:text-gray-400">{team.side}</p>}
          {match.state !== 'pre' && <p className="mt-2 break-all text-4xl font-black tabular-nums sm:text-5xl">{team.score ?? '—'}</p>}
        </div>)}</div>
      </>}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Only ESPN-reported data is shown. — means not reported. Coverage varies by sport and match status.</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>
    </header>
    {!match ? <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{source.httpStatus === 403 ? 'Access to ESPN match details was refused (HTTP 403).' : 'ESPN match details are currently unavailable.'} No sample statistics or lineups are substituted. Please try refreshing.</p> : <>
      <div role="group" aria-label="Match detail sections" className="sticky top-16 z-20 mb-4 flex min-w-0 gap-2 overflow-x-auto rounded-2xl bg-gray-100 py-2 dark:bg-gray-900">
        {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} aria-controls={sectionId} onClick={() => { setSection(id); if (id === 'table') setTableOpened(true); }} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${section === id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>{label}</button>)}
      </div>
      <section id={sectionId} aria-label={sections.find(([id]) => id === section)?.[1]} aria-busy={loading} className="min-w-0 rounded-3xl bg-white p-3 shadow-sm sm:p-5 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-bold">{section === 'events' ? match.updatesLabel : sections.find(([id]) => id === section)?.[1]}</h2>
        {section === 'statistics' && (match.statistics.length ? <><p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Bars compare reported numeric values only: blue for {match.teams[0].name}, purple for {match.teams[1].name}. Missing values and incompatible formats are not compared.</p><table className="w-full table-fixed text-sm">
          <thead><tr><th scope="col" className="w-2/5 p-2 text-left">Statistic</th>{match.teams.map((team) => <th scope="col" key={team.id} className="break-words p-2 text-center">{team.name}</th>)}</tr></thead>
          <tbody>{match.statistics.map((stat) => {
            const values = match.teams.map((team) => stat.values.find((value) => value.teamId === team.id)?.value);
            const share = statisticShare(values);
            return <tr key={stat.name} className="border-t border-gray-100 dark:border-gray-700"><th scope="row" className="break-words p-2 text-left font-medium">{stat.label}
              {share !== null && <div role="img" aria-label={`Relative comparison: ${match.teams[0].name} ${values[0]}, ${match.teams[1].name} ${values[1]}`} className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-violet-400"><span className="h-full bg-blue-500" style={{ width: `${share}%` }} /></div>}
            </th>{match.teams.map((team, index) => <td key={team.id} className="break-all p-2 text-center tabular-nums">{values[index] ?? '—'}</td>)}</tr>;
          })}</tbody>
        </table></> : <EmptySection>Team statistics have not been provided by ESPN for this match yet.</EmptySection>)}
        {section === 'lineups' && (match.lineups.length ? <div className="grid min-w-0 gap-3 md:grid-cols-2">{match.teams.map((team) => { const lineup = match.lineups.find((item) => item.teamId === team.id); return lineup ? <Lineup key={team.id} lineup={lineup} name={team.name} /> : <article key={team.id} className="min-w-0 rounded-2xl border border-gray-200 p-4 dark:border-gray-700"><h3 className="break-words font-bold">{team.name}</h3><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No roster reported for this team.</p></article>; })}</div> : <EmptySection>Lineups and rosters have not been provided by ESPN. Starting lineups are often published closer to kickoff.</EmptySection>)}
        {section === 'players' && (match.playerStats.length ? <div className="space-y-5">{match.playerStats.map((group, index) => <div key={index} className="min-w-0">
          <h3 className="mb-2 break-words font-bold">{teamName(group.teamId)} · {group.label}</h3>
          <div role="region" aria-label={`${teamName(group.teamId)} ${group.label} statistics`} tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700"><table className="w-full whitespace-nowrap text-sm">
            <thead><tr><th scope="col" className="p-3 text-left">Player</th>{group.columns.map((label, i) => <th scope="col" key={i} className="p-3 text-right">{label}</th>)}</tr></thead>
            <tbody>{group.players.map((person) => <tr key={person.id} className="border-t border-gray-100 dark:border-gray-700"><th scope="row" className="p-3 text-left font-medium">{person.name}</th>{person.values.map((value, i) => <td key={i} className="p-3 text-right tabular-nums">{value ?? '—'}</td>)}</tr>)}</tbody>
          </table></div>
        </div>)}</div> : <EmptySection>Individual player statistics have not been provided by ESPN for this match.</EmptySection>)}
        <div hidden={section !== 'table'}>{tableOpened && <SportsLeagueTable key={`${match.reference.league}-${match.season?.year ?? 'current'}`} match={match} />}</div>
        {section === 'events' && (match.updates.length ? <>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Up to 200 reported updates, in ESPN’s supplied order. This may be a key-event or scoring-only feed, not every play.</p>
          <ol className="space-y-3">{match.updates.map((update) => <li key={update.id} className="min-w-0 rounded-2xl border border-gray-100 p-3 dark:border-gray-700">
            <p className="mb-1 break-words text-xs font-semibold text-blue-600 dark:text-blue-400">{[update.period ? `Period ${update.period}` : '', update.clock, update.team].filter(Boolean).join(' · ')}</p><p className="break-words text-sm">{update.text}</p>{!!update.participants?.length && <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">Reported players: {update.participants.join(', ')}</p>}
          </li>)}</ol>
        </> : <EmptySection>Match events and play-by-play updates have not been provided by ESPN for this match yet.</EmptySection>)}
      </section>
    </>}
    <details className="mt-5 min-w-0 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN match feed details</summary>
      <p className="break-words">{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}{source.error ? ` · ${source.error}` : ''}</p>
      <EspnResponseDetails metadata={source.responseMetadata} />
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-600 underline dark:text-blue-400">{source.url}</a>
    </details>
  </div>;
}
