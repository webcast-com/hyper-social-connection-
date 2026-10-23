'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { MatchReference } from '@/lib/espn-match';
import { INSIGHT_LABELS, isInsightsBoard, type InsightsBoard } from '@/lib/espn-insights';
import { formatPredictionKickoff } from '@/lib/sports';

export default function SportsPredictionInsights({ reference }: { reference: MatchReference }) {
  const [opened, setOpened] = useState(false);
  const [board, setBoard] = useState<InsightsBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => () => { const current = request.current; request.current = null; current?.abort(); }, []);
  const load = async (refresh = false) => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/sports/matches/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.eventId)}/insights${refresh ? '?refresh=1' : ''}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Insights request failed');
      const next: unknown = await response.json();
      if (!isInsightsBoard(next, reference)) throw new Error('Invalid insight response');
      if (controller.signal.aborted) return;
      if (board && board.sections.some((old) => old.status === 'ready' && next.sections.find((section) => section.kind === old.kind)?.status !== 'ready')) throw new Error('Incomplete refresh');
      setBoard(next);
    } catch {
      if (request.current === controller) setError('ESPN insights could not be updated. Try again shortly.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  };
  return <div className="mt-3 min-w-0 text-xs">
    <button type="button" aria-expanded={opened} aria-controls={id} onClick={() => { setOpened(!opened); if (!opened && !board && !busy) void load(); }} className="min-h-11 text-left font-bold text-blue-600 dark:text-blue-400">{opened ? 'Hide ESPN insights' : 'Show ESPN insights'}</button>
    <div id={id} hidden={!opened} aria-busy={busy} className="min-w-0 space-y-3">
      <p className="text-gray-600 dark:text-gray-300">Model estimates, game/live probabilities, strength ratings and bookmaker prices are separate sources—not guaranteed outcomes. Missing outcomes are not inferred; percentages may not form a complete outcome set. Market settlement rules may differ. Insights refresh separately from the main odds.</p>
      {busy && <p role="status">Loading ESPN insights…</p>}
      {error && <p role="alert" className="text-amber-800 dark:text-amber-300">{error}{board && ' Showing previously loaded insights.'}</p>}
      {board && <>
        <p className="text-gray-500 dark:text-gray-400">Current reported data, not a historical pre-match snapshot. Match phase: {board.matchState === 'pre' ? 'scheduled' : board.matchState === 'in' ? 'in progress' : board.matchState === 'post' ? 'finished' : 'not reported'}. Fetched {formatPredictionKickoff(board.fetchedAt)}.</p>
        {board.sections.map((section) => <section key={section.kind} aria-label={INSIGHT_LABELS[section.kind]} className="min-w-0 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <h3 className="font-bold">{INSIGHT_LABELS[section.kind]}</h3>
          {section.kind === 'powerindex' && <p className="mt-1 text-gray-500 dark:text-gray-400">Provider strength metrics—not win probabilities.</p>}
          {section.kind === 'probabilities' && <p className="mt-1 text-gray-500 dark:text-gray-400">Game/play snapshot, not a pre-match recommendation. Where multiple records are supplied, only the most recent timestamped record in this response is shown.</p>}
          {section.kind === 'odds' && <p className="mt-1 text-gray-500 dark:text-gray-400">Bookmaker prices—not model confidence. Independent of the odds above.</p>}
          {section.status === 'ready' ? <dl className="mt-2 space-y-2">{section.values.map((value, index) => <div key={index} className="flex min-w-0 justify-between gap-2"><dt className="min-w-0 break-words">{value.label}</dt><dd className="min-w-0 max-w-1/2 break-all text-right font-semibold tabular-nums">{value.value}</dd></div>)}</dl> : <p className="mt-2 break-words text-gray-500 dark:text-gray-400">{section.status === 'empty' ? 'No matching data in this response.' : section.status === 'unsupported' ? 'Model/data format unavailable.' : section.status === 'skipped' ? 'Not requested.' : 'Source unavailable.'} {section.message}</p>}
          {section.observedAt && <p className="mt-2 text-gray-500 dark:text-gray-400">Provider timestamp: {formatPredictionKickoff(section.observedAt)}</p>}
          {section.status === 'ready' && !section.observedAt && <p className="mt-2 text-gray-500 dark:text-gray-400">Provider timestamp not reported; fetch time does not establish freshness.</p>}
          {section.truncated && <p className="mt-2 text-amber-800 dark:text-amber-300">Partial response: more records exist. Additional pages are not fetched.</p>}
          <details className="mt-2 min-w-0"><summary className="min-h-8 cursor-pointer">Source details</summary><p>{section.httpStatus === null ? 'No HTTP response' : `HTTP ${section.httpStatus}`} · {section.status}</p>{section.url && <a href={section.url} target="_blank" rel="noopener noreferrer" className="block break-all text-blue-600 underline dark:text-blue-400">{section.url}</a>}</details>
        </section>)}
      </>}
      {!busy && <button type="button" onClick={() => void load(true)} className="min-h-11 rounded-lg border border-gray-300 px-3 font-semibold dark:border-gray-600">{board ? 'Refresh insights' : 'Retry insights'}</button>}
    </div>
  </div>;
}
