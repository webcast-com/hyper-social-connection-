'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { matchHref } from '@/lib/espn-match';
import { ArrowLeft, BarChart2, CalendarClock, RefreshCw, Share2, Trophy } from 'lucide-react';
import SportsPredictionInsights from './SportsPredictionInsights';
import EmptyState from '@/components/EmptyState';
import EspnResponseDetails from '@/components/EspnResponseDetails';
import { decimalToAmerican, ODDS_SPORTS, type OddsBoard, type OddsMatch } from '@/lib/espn-odds';
import { refreshEspnOdds, SportsRequestError } from '@/lib/espn-odds-client';
import { SPORT_LABELS, type SportKind } from '@/lib/sports-catalog';
import { formatPredictionKickoff } from '@/lib/sports';
import { pickedName, pickSidesFor, type MatchPick, type PickSide } from '@/lib/sports-picks';
import { createPost, placeMatchPick } from '@/app/actions';

function matchText(match: OddsMatch, note: string) {
  const odds = match.odds;
  return [
    `🏆 ${match.home_team} vs ${match.away_team}`, match.league,
    `Kickoff: ${formatPredictionKickoff(match.kickoff)}`,
    `ESPN-reported decimal odds: ${[
      odds.home !== null ? `Home ${odds.home}` : '', odds.draw !== null ? `Draw ${odds.draw}` : '',
      odds.away !== null ? `Away ${odds.away}` : '', odds.over_under !== null ? `O/U ${odds.over_under}` : '',
      odds.spread !== null ? `Reported spread ${odds.spread}` : '',
      ...([['Spread home price', odds.spread_home_odds], ['Spread away price', odds.spread_away_odds], ['Over price', odds.over_odds], ['Under price', odds.under_odds]] as const)
        .filter(([, value]) => value != null).map(([label, value]) => `${label} ${value}`),
    ].filter(Boolean).join(' · ')}`,
    odds.provider ? `Provider: ${odds.provider}` : '',
    'Bookmaker odds, not a model prediction. Prices may change.', note.trim(), '#Sports #MatchDay',
  ].filter(Boolean).join('\n');
}

/**
 * The price a reader would have picked at, read from the same odds ESPN reported
 * on this card. `null` when ESPN reported no price for that side, which the card
 * says plainly rather than filling in.
 */
function priceFor(match: OddsMatch, side: PickSide): number | null {
  const price = side === 'home' ? match.odds.home : side === 'away' ? match.odds.away : match.odds.draw;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}

function MatchCard({ match, currentUserId, pick = null }: { match: OddsMatch; currentUserId?: number; pick?: MatchPick | null }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  // A pick is its own transition: sharing one would let a reader's pick disable
  // the Share button and read as the same action.
  const [pickPending, startPickTransition] = useTransition();
  const [pickError, setPickError] = useState('');
  const [justPicked, setJustPicked] = useState<MatchPick | null>(null);
  const recorded = pick ?? justPicked;
  const sides = pickSidesFor(match.sport);

  /**
   * Take a pick. Everything that decides whether it may be taken — the fixture,
   * the kickoff lock, the sides on offer, the price — is checked server-side
   * against what ESPN reported, so this only reports the answer.
   */
  const takePick = (side: PickSide) => {
    if (!currentUserId || pickPending || recorded || !match.details) return;
    setPickError('');
    const reference = match.details;
    startPickTransition(async () => {
      try {
        const result = await placeMatchPick({ league: reference.league, eventId: reference.eventId, side });
        // The browser layout harness stubs every server action to return
        // nothing, so an absent answer is not treated as a refusal.
        if (result && !result.ok) setPickError(result.message);
        else if (result?.ok) setJustPicked(result.pick);
      } catch {
        setPickError('Could not record your pick. Please try again.');
      }
    });
  };
  const publish = (poll: boolean) => {
    if (!currentUserId || pending) return;
    setError('');
    const data = new FormData();
    data.set('content', matchText(match, note));
    if (poll) {
      data.set('hasPoll', 'true');
      const options = match.sport === 'football' ? [match.home_team, 'Draw', match.away_team] : [match.home_team, match.away_team];
      options.forEach((option, index) => data.set(`pollOption${index + 1}`, option));
      data.set('pollDurationDays', '1');
    }
    startTransition(async () => {
      try { await createPost(data); setNote(''); }
      catch { setError('Unable to publish. Please try again.'); }
    });
  };
  return (
    <article className="min-w-0 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm dark:border-violet-900/50 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className="min-w-0 break-words text-violet-700 dark:text-violet-300">{match.league}</span>
        <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700 dark:bg-violet-950 dark:text-violet-200">{match.is_premium ? 'Premium' : 'Free'}</span>
      </div>
      <h2 className="flex min-w-0 items-start gap-2 text-sm font-bold text-gray-900 dark:text-white">
        {match.home_logo && <img src={match.home_logo} alt="" className="h-7 w-7 shrink-0 object-contain" />}
        <span className="min-w-0 break-words">{match.home_team} <span className="font-normal text-gray-500">vs</span> {match.away_team}</span>
        {match.away_logo && <img src={match.away_logo} alt="" className="h-7 w-7 shrink-0 object-contain" />}
      </h2>
      <p className="mt-2 flex items-start gap-1 text-xs text-gray-600 dark:text-gray-300">
        <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" /><span suppressHydrationWarning>{formatPredictionKickoff(match.kickoff)}</span>
      </p>
      {match.venue && <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">{match.venue}</p>}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-violet-50 p-3 text-xs dark:bg-violet-950/30">
        {([['Home', match.odds.home], ['Draw', match.odds.draw], ['Away', match.odds.away],
          ['Spread home price', match.odds.spread_home_odds], ['Spread away price', match.odds.spread_away_odds],
          ['Over price', match.odds.over_odds], ['Under price', match.odds.under_odds]] as const).filter(([, value]) => value != null).map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="break-all font-bold tabular-nums text-gray-900 dark:text-white"><span>{value!.toFixed(2)}</span>{decimalToAmerican(value) && <span className="mt-1 block text-[10px] font-normal">American (derived): {decimalToAmerican(value)}</span>}</dd></div>
        ))}
        {match.odds.over_under !== null && <div className="min-w-0"><dt className="text-gray-500 dark:text-gray-400">Total (O/U)</dt><dd className="break-all font-bold text-gray-900 dark:text-white">{match.odds.over_under}</dd></div>}
        {match.odds.spread !== null && <div className="min-w-0"><dt className="text-gray-500 dark:text-gray-400">Spread</dt><dd className="break-all font-bold text-gray-900 dark:text-white">{match.odds.spread}</dd></div>}
      </dl>
      <p className="mt-2 break-words text-[11px] text-gray-500 dark:text-gray-400">Decimal odds · {match.odds.provider || 'Provider not specified'} · via ESPN</p>

      {/* A pick is recorded against the fixture ESPN reported, at the price this
          card shows, and graded only from a result ESPN reports. A fixture with
          no ESPN match id cannot be graded later, so it cannot be picked. */}
      {match.details ? (
        <div className="mt-3 min-w-0 rounded-2xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Your pick</p>
          {recorded ? (
            <div className="min-w-0">
              <p className="break-words text-xs font-bold text-gray-900 dark:text-white" aria-label={`Your pick: ${pickedName(recorded)}`}>
                {pickedName(recorded)}
                {recorded.price !== null ? <span className="font-semibold tabular-nums text-gray-600 dark:text-gray-300"> at {recorded.price.toFixed(2)}</span>
                  : <span className="font-normal text-gray-500 dark:text-gray-400"> · no price was reported</span>}
              </p>
              <p className="mt-1 break-words text-[11px] text-gray-600 dark:text-gray-300">
                {recorded.outcome === 'won' ? `Graded: won, +1 point (${recorded.homeScore}–${recorded.awayScore})`
                  : recorded.outcome === 'lost' ? `Graded: lost (${recorded.homeScore}–${recorded.awayScore})`
                    : 'Awaiting a result — graded once ESPN reports the final score.'}
              </p>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">The first pick on a fixture stands.</p>
            </div>
          ) : currentUserId ? (
            <>
              <div role="group" aria-label={`Pick a side for ${match.home_team} against ${match.away_team}`}
                className={`grid min-w-0 gap-2 ${sides.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {sides.map((side) => {
                  const price = priceFor(match, side);
                  return (
                    <button key={side} type="button" disabled={pickPending} onClick={() => takePick(side)}
                      className="inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white px-1.5 py-1.5 ring-1 ring-violet-200 transition-colors hover:bg-violet-100 disabled:opacity-60 dark:bg-gray-800 dark:ring-violet-900/60 dark:hover:bg-gray-700">
                      <span className="w-full min-w-0 truncate text-center text-[11px] font-bold text-gray-900 dark:text-white">
                        {side === 'home' ? match.home_team : side === 'away' ? match.away_team : 'Draw'}
                      </span>
                      <span className="w-full min-w-0 truncate text-center text-[10px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                        {price !== null ? price.toFixed(2) : 'no price'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                Picks lock at kickoff, are graded when ESPN reports the result, and the first pick stands.
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Log in to record a pick — it is graded when ESPN reports the result.
            </p>
          )}
          {pickError && <p role="alert" className="mt-2 break-words text-xs text-red-700 dark:text-red-300">{pickError}</p>}
        </div>
      ) : (
        <p className="mt-2 break-words text-[11px] text-gray-500 dark:text-gray-400">
          ESPN reported no match id for this fixture, so a pick on it could not be graded.
        </p>
      )}

      {match.details && <Link href={matchHref(match.details)} prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">View match details</Link>}
      {match.details && <SportsPredictionInsights key={`${match.details.league}-${match.details.eventId}`} reference={match.details} />}
      {currentUserId ? <>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} aria-label={`Your take on ${match.home_team} vs ${match.away_team}`}
          placeholder="Add your take before sharing…" className="mt-3 w-full min-w-0 rounded-xl border border-gray-200 bg-transparent p-3 text-sm text-gray-900 dark:border-gray-700 dark:text-white" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={() => publish(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-60"><BarChart2 aria-hidden="true" className="h-4 w-4" />Poll this</button>
          <button type="button" disabled={pending} onClick={() => publish(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-60"><Share2 aria-hidden="true" className="h-4 w-4" />{pending ? 'Posting…' : 'Share'}</button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
      </> : <Link href="/login" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-blue-600 dark:text-blue-400">Log in to share or create a poll</Link>}
    </article>
  );
}

/**
 * The predictions page: odds, insights, and a reader's pick on each fixture.
 *
 * `picksByMatchId` is keyed by the odds board's own match id, which the page
 * resolved from the viewer's stored picks, so this component never has to build
 * a fixture key or reach for the module that holds the database.
 *
 * `leaderboard` is a server-rendered slot. The rail reads the picks table, and a
 * client component that imported it would pull the database module into the
 * browser bundle; passed as a node it is rendered on the server and placed here.
 */
export default function SportsPredictionsBoard({
  initial, currentUserId, picksByMatchId = {}, leaderboard = null,
}: {
  initial: OddsBoard;
  currentUserId?: number;
  picksByMatchId?: Record<string, MatchPick>;
  leaderboard?: ReactNode;
}) {
  const [board, setBoard] = useState(initial);
  const [sport, setSport] = useState('');
  const [perLeague, setPerLeague] = useState(0);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const deniedCount = board.sources.filter((source) => source.httpStatus === 403).length;
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const refresh = async (event: FormEvent) => {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const next = await refreshEspnOdds({ sports: sport ? [sport] : [], perLeague, days }, controller.signal);
      if (!controller.signal.aborted) setBoard(next);
    } catch (error) {
      const routeMissing = error instanceof SportsRequestError && error.httpStatus === 404;
      if (!controller.signal.aborted) setError(routeMissing
        ? 'The app endpoint /api/sports/predictions returned HTTP 404. Check this deployment includes the odds API. Keeping the previous results.'
        : 'Could not refresh ESPN odds. Keeping the previous results; please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  return (
    <div className="mx-auto mt-4 max-w-5xl p-3 sm:mt-6 sm:p-4">
      <Link href="/sports" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores</Link>
      <header className="mb-5 rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wide">ESPN match odds</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black sm:text-3xl"><Trophy aria-hidden="true" className="h-7 w-7 shrink-0 text-amber-300" />Match predictions</h1>
        <p className="mt-2 text-sm">Upcoming fixtures and bookmaker odds. Open ESPN insights for supported model estimates, game/live probabilities and strength ratings. No guaranteed outcomes.</p>
        <p className="mt-2 text-xs">{board.matches.length} matches · Prices can change; refresh for the latest update.</p>
        <p className="mt-1 text-xs" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>
      </header>
      <form onSubmit={refresh} aria-busy={loading} className="mb-4 grid min-w-0 grid-cols-2 items-end gap-3 sm:grid-cols-4">
        <label className="min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-200">Sport
          <select value={sport} onChange={(event) => setSport(event.target.value)} disabled={loading} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
            <option value="">Primary leagues</option>{ODDS_SPORTS.map((id) => <option key={id} value={id}>{SPORT_LABELS[id as SportKind]}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-200">Per league (0 = no cap)
          <input type="number" min={0} max={12} value={perLeague} disabled={loading} onChange={(event) => { const value = Math.min(12, Math.max(0, Math.floor(Number(event.target.value) || 0))); setPerLeague(value); if (!value) setDays(1); }} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800" />
        </label>
        <label className="min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-200">Days ahead
          <input type="number" min={1} max={10} value={days} disabled={loading || !perLeague} onChange={(event) => setDays(Math.min(10, Math.max(1, Math.floor(Number(event.target.value) || 1))))} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-2 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800" />
        </label>
        <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Loading odds…' : 'Refresh matches'}</button>
      </form>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Up to 48 matches. The first six are flagged Free; Premium is feed metadata only, not a payment gate. Multi-day searches require a per-league cap.</p>
      {error && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {deniedCount > 0 && <p role="note" aria-label="ESPN access restriction" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Access to ESPN was refused (HTTP 403) for {deniedCount} feeds. Check the hosting network’s outbound-access policy and ESPN access permissions. The status alone does not identify who blocked the request; see response metadata below.
      </p>}
      {board.status === 'unavailable' && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{deniedCount ? 'Access to ESPN odds was refused. No sample odds are shown.' : 'ESPN odds could not be reached. No sample odds are shown.'}</p>}
      {board.status === 'partial' && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Some ESPN feeds are unavailable or the search time limit was reached. {board.matches.length ? 'Showing matches from responding feeds.' : 'No qualifying matches were found in responding feeds.'}</p>}
      {leaderboard}
      {board.matches.length ? <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">{board.matches.map((match) => <MatchCard key={match.id} match={match} currentUserId={currentUserId} pick={picksByMatchId[match.id] ?? null} />)}</div>
        : <EmptyState variant="search" title="No upcoming matches with odds">Only scheduled home/away fixtures with reported ESPN odds appear here. Markets may be unavailable for some leagues or dates.</EmptyState>}
      {board.sources.length > 0 && <details className="mt-4 rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <summary className="min-h-11 cursor-pointer font-semibold">Feed details ({board.sources.filter((source) => source.ok).length}/{board.sources.length} responding)</summary>
        <ul className="mt-2 space-y-3">{board.sources.slice(0, 50).map((source, index) => <li key={index} className="min-w-0 break-words">
          <p>{source.path}{source.date ? ` · ${source.date}` : ''}: {source.ok ? `${source.count} qualifying fixtures` : source.error || 'Unavailable'}</p>
          {source.httpStatus !== undefined && <p>{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}</p>}
          <EspnResponseDetails metadata={source.responseMetadata} />
          {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline dark:text-blue-400">{source.url}</a>}
        </li>)}</ul>
      </details>}
    </div>
  );
}
