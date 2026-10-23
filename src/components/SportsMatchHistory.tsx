'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { MatchDetails } from '@/lib/espn-match';
import { historyOutcome, isMatchHistoryBoard, type HistoryGame, type MatchHistoryBoard } from '@/lib/espn-match-history';
import { formatPredictionKickoff } from '@/lib/sports';
import { safeSportsReturnPath } from '@/lib/sports-filters';

function Results({ games, match, teamId, returnTo }: { games: HistoryGame[]; match: MatchDetails; teamId?: string; returnTo?: string }) {
  return <ol className="mt-3 space-y-3">{games.map((game) => {
    const outcome = teamId ? historyOutcome(game, teamId) : null;
    return <li key={game.id} className="min-w-0 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        {teamId && <span className="rounded bg-blue-50 px-2 py-1 font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200" aria-label={outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : outcome === 'D' ? 'Draw or tie' : 'Outcome not reported'}>{outcome ?? '—'}</span>}
        <span>{formatPredictionKickoff(game.kickoff)}</span><span>{game.status ?? 'Completed'}</span>
      </div>
      <Link prefetch={false} href={`/sports/matches/${encodeURIComponent(match.reference.league)}/${game.id}?returnTo=${encodeURIComponent(safeSportsReturnPath(returnTo))}`} className="mt-2 block rounded text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500">
        {game.teams.map((team) => <span key={team.id} className="flex min-w-0 justify-between gap-3 py-1"><span className="min-w-0 break-words">{team.name}{team.side && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({team.side})</span>}</span><span className="shrink-0 font-bold tabular-nums">{team.score}</span></span>)}
      </Link>
      {game.teams.some((team) => team.shootout !== null) && <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">Shootout: {game.teams.map((team) => `${team.name} ${team.shootout ?? '—'}`).join(' · ')}</p>}
    </li>;
  })}</ol>;
}
export function SportsMatchHistory({ match, returnTo }: { match: MatchDetails; returnTo?: string }) {
  const matchContext = useRef(match);
  useEffect(() => { matchContext.current = match; }, [match]);
  const [board, setBoard] = useState<MatchHistoryBoard | null>(null);
  const previous = useRef<MatchHistoryBoard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const load = useCallback(async (refresh = false) => {
    if (request.current) return;
    const match = matchContext.current;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/sports/matches/${encodeURIComponent(match.reference.league)}/${match.reference.eventId}/history${refresh ? '?refresh=1' : ''}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('History request failed');
      const next: unknown = await response.json();
      if (!isMatchHistoryBoard(next, match)) throw new Error('Invalid history response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable') { setError(next.message ?? 'Match history is unavailable. Try again shortly.'); return; }
      if (next.status === 'partial' && previous.current) throw new Error('Incomplete refresh');
      previous.current = next; setBoard(next);
    } catch {
      if (request.current === controller) setError('Match history could not be loaded. Try again shortly.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) void load(); });
    return () => { mounted.current = false; const active = request.current; request.current = null; active?.abort(); };
  }, [load]);
  return <div className="min-w-0 space-y-4" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-600 dark:text-gray-300">Completed results before this match’s kickoff only.</p><button type="button" disabled={busy} onClick={() => void load(true)} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600">{busy ? 'Loading history…' : board ? 'Refresh history' : 'Retry history'}</button></div>
    {busy && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Loading recent results…</p>}
    {error && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{error}{board && ' Showing previously loaded results.'}</p>}
    {board && <>
      <p className="text-xs text-gray-500 dark:text-gray-400">Scope: schedules requested for {match.leagueName} · provider seasons {board.seasonYears.join(' and ')} · latest first, up to five results per list. Other competitions are not separately fetched; explicitly mismatched competitions and unreported fixtures are excluded. This is not a complete history or an all-time head-to-head record.</p>
      {board.status === 'partial' && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{board.message}</p>}
      <h3 className="text-base font-bold">Recent form</h3>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">{board.teams.map((team) => <article key={team.teamId} className="min-w-0"><h4 className="break-words font-semibold">{team.name}</h4>
        {team.sources.some((source) => !source.ok) && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Some seasons could not be loaded for this team.</p>}
        {team.games.length ? <Results games={team.games} match={match} teamId={team.teamId} returnTo={returnTo} /> : <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No usable completed results were supplied in the available schedules before kickoff.</p>}
      </article>)}</div>
      <h3 className="pt-3 text-base font-bold">Head-to-head</h3>
      {board.headToHead.length ? <Results games={board.headToHead} match={match} returnTo={returnTo} /> : <p className="text-sm text-gray-500 dark:text-gray-400">No previous meetings were found in the available schedules. This does not mean the teams have never met.</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400">W = win · D = draw/tie · L = loss · — = outcome not established. Provider winner flags and reported shootouts take precedence over tied scores. Extra time / penalties follow the reported final status.</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">Source: ESPN · History fetched {formatPredictionKickoff(board.fetchedAt)}. Refreshes separately from match details.</p>
    </>}
  </div>;
}
