'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchDetails } from '@/lib/espn-match';
import { isStandingsBoard, type StandingsBoard } from '@/lib/espn-standings';

export function SportsLeagueTable({ match }: { match: MatchDetails }) {
  const season = match.season?.year ?? null;
  const [board, setBoard] = useState<StandingsBoard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const request = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const load = useCallback(async (refresh = false) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setBusy(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (season !== null) params.set('season', String(season));
      if (refresh) params.set('refresh', '1');
      const response = await fetch(`/api/sports/standings/${encodeURIComponent(match.reference.league)}${params.size ? `?${params}` : ''}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Standings request failed');
      const next: unknown = await response.json();
      if (!isStandingsBoard(next, match.reference.league, season)) throw new Error('Invalid standings response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable') throw new Error('Standings unavailable');
      setBoard(next);
    } catch {
      if (request.current === controller) setError('League table could not be loaded. Try again shortly.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, [match.reference.league, season]);
  useEffect(() => {
    loaded.current = true;
    // Defer initial work so effect cleanup can prevent an obsolete/Strict Mode request.
    void Promise.resolve().then(() => { if (loaded.current) void load(); });
    return () => { loaded.current = false; const active = request.current; request.current = null; active?.abort(); };
  }, [load]);
  const teams = match.teams.map((team) => team.id);
  const group = board?.groups.find((item) => item.id === selection)
    ?? board?.groups.find((item) => item.rows.some((row) => teams.includes(row.teamId))) ?? board?.groups[0];
  return <div className="min-w-0 space-y-4" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-gray-600 dark:text-slate-300">
        <p>{board?.season ? `Season ${board.season.label ?? board.season.year}` : season !== null ? `Requested season: ${season}` : 'Current provider season'}</p>
        {season === null && <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">The match season was not reported. This is the provider’s current table, not a historical match table.</p>}
      </div>
      <button type="button" disabled={busy} onClick={() => void load(true)} className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50">{busy ? 'Loading table…' : board ? 'Refresh table' : 'Retry table'}</button>
    </div>
    {busy && <p role="status" className="text-sm text-gray-500 dark:text-slate-400">Loading league table…</p>}
    {error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{error}{board && ' Showing the previously loaded table.'}</p>}
    {board?.status === 'empty' && <p className="text-sm text-gray-500 dark:text-slate-400">No league table was supplied for this competition and season. Cup and knockout competitions may not have standings.</p>}
    {group && <>
      {board!.groups.length > 1 && <label className="block text-sm text-gray-600 dark:text-slate-300">Table / group<select value={group.id} onChange={(event) => setSelection(event.target.value)} className="mt-2 block w-full min-w-0 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-gray-900 dark:text-white">{board!.groups.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <p className="text-xs text-gray-500 dark:text-slate-400">Match teams, when present, are highlighted and marked “In this match”. Order and positions come from ESPN. This is the provider’s season table, not a snapshot at kickoff or an in-match projection. Missing values are shown as —.</p>
      <div role="region" aria-label={`${group.label} standings, scroll for all statistics`} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="bg-white dark:bg-slate-900 px-3 py-3 text-left font-semibold text-gray-900 dark:text-white">{group.label}</caption>
          <thead className="bg-gray-100 dark:bg-slate-800 text-xs text-gray-600 dark:text-slate-300"><tr><th scope="col" className="px-3 py-3">Pos</th><th scope="col" className="sticky left-0 z-10 min-w-40 bg-gray-100 dark:bg-slate-800 px-3 py-3">Team</th>{group.columns.map((column) => <th key={column.name} scope="col" className="whitespace-nowrap px-3 py-3 text-right"><abbr title={column.description} className="no-underline">{column.label}</abbr></th>)}</tr></thead>
          <tbody>{group.rows.map((row) => {
            const involved = teams.includes(row.teamId); const background = involved ? 'bg-blue-50 dark:bg-sky-950' : 'bg-white dark:bg-slate-900';
            return <tr key={row.teamId} className={`${background} border-t border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200`}><td className="px-3 py-3 tabular-nums">{row.rank ?? '—'}</td><th scope="row" className={`sticky left-0 z-10 max-w-52 px-3 py-3 font-medium ${background}`}><span className="block">{row.team}</span>{involved && <span className="mt-1 block text-xs text-blue-700 dark:text-sky-300">In this match</span>}{row.note && <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-slate-400">{row.note}</span>}</th>{group.columns.map((column) => <td key={column.name} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{row.values[column.name] ?? '—'}</td>)}</tr>;
          })}</tbody>
        </table>
      </div>
    </>}
    {board && <p className="text-xs text-gray-500 dark:text-slate-400">Source: ESPN · Table fetched {new Date(board.fetchedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })} EAT. Standings refresh separately from the match.</p>}
  </div>;
}
