import { getMatchDetails } from './espn-match-feed';
import { resolveMatch, type MatchReference } from './espn-match';
import { ESPN_REQUEST_HEADERS, EspnEndpointError, espnFailureDetails, espnResponseMetadata } from './espn-endpoints';
import { INSIGHT_KINDS, insightUrls, parseInsight, type InsightSection, type InsightsBoard } from './espn-insights';

const cache = new Map<string, { at: number; board: InsightsBoard }>();
const pending = new Map<string, Promise<InsightsBoard>>();
const MAX_BYTES = 2 * 1024 * 1024;
/** Bound response bodies as well as time; never fetch a provider $ref or another page. */
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('Empty body');
  let total = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > MAX_BYTES) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const combined = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(combined));
}
function skipped(reference: MatchReference, message: string): InsightsBoard {
  return { reference, fetchedAt: new Date().toISOString(), matchState: null, status: 'unavailable', sections: INSIGHT_KINDS.map((kind) => ({ kind, status: 'skipped', values: [], url: null, httpStatus: null, observedAt: null, truncated: false, message })) };
}
async function fetchInsights(league: string, eventId: string): Promise<InsightsBoard> {
  const { reference } = resolveMatch(league, eventId);
  const summary = await getMatchDetails(league, eventId);
  const match = summary.match;
  if (!match) return skipped(reference, 'Match details are unavailable. No insight endpoints were requested.');
  if (!['home', 'away'].every((side) => match.teams.filter((team) => team.side === side && /^[1-9]\d{0,19}$/.test(team.id)).length === 1)) return skipped(reference, 'Reported home and away team IDs are required.');
  const urls = insightUrls(match); const signal = AbortSignal.timeout(8000);
  const sections = await Promise.all(INSIGHT_KINDS.map(async (kind): Promise<InsightSection> => {
    const url = urls[kind];
    const base = { kind, url, httpStatus: null, values: [], observedAt: null, truncated: false, message: null };
    if (!url) return { ...base, status: 'skipped', message: 'The match summary did not report a competition ID. The event ID is not substituted.' };
    let status: number | null = null;
    try {
      const response = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal, redirect: 'error' }); status = response.status;
      if (!response.ok) {
        const metadata = espnResponseMetadata(response.headers); await response.body?.cancel().catch(() => undefined);
        throw new EspnEndpointError(`ESPN HTTP ${status}`, url, 'http', status, metadata);
      }
      return { ...base, ...parseInsight(kind, await boundedJson(response), match), httpStatus: status };
    } catch (error) {
      const failure = error instanceof EspnEndpointError ? error : new EspnEndpointError(signal.aborted ? 'ESPN insights timed out' : status !== null ? 'ESPN returned invalid insight data' : 'ESPN insight request failed', url, signal.aborted ? 'timeout' : status !== null ? 'invalid-response' : 'network', status);
      const details = espnFailureDetails(failure, url);
      return { ...base, status: 'unavailable', httpStatus: details.httpStatus, errorKind: details.errorKind, responseMetadata: details.responseMetadata, message: details.error };
    }
  }));
  return { reference, fetchedAt: new Date().toISOString(), matchState: match.state, sections,
    status: sections.every((section) => !section.truncated && (section.status === 'ready' || section.status === 'empty')) ? 'ready' : sections.some((section) => section.status === 'ready' || section.status === 'empty') ? 'partial' : 'unavailable' };
}
/** Two jobs × five endpoints = at most ten Core calls. Summary work has its existing separate limits. */
export function getEspnInsights(league: string, eventId: string, refresh = false): Promise<InsightsBoard> {
  const { url } = resolveMatch(league, eventId);
  const active = pending.get(url); if (active) return active;
  const saved = cache.get(url);
  if (!refresh && saved && Date.now() - saved.at < (saved.board.status === 'ready' ? 60_000 : 15_000)) return Promise.resolve(saved.board);
  if (pending.size >= 2) return Promise.reject(new Error('ESPN insights are busy. Try again shortly.'));
  const job = fetchInsights(league, eventId).then((board) => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), board }); return board;
  }).finally(() => pending.delete(url));
  pending.set(url, job); return job;
}
