import { matchReference, resolveMatch, type MatchDetails, type MatchReference } from './espn-match';
import { mapOdds } from './espn-odds';
import type { EspnFailureKind, EspnResponseMetadata } from './espn-endpoints';

export const INSIGHT_KINDS = ['predictions', 'predictor', 'probabilities', 'powerindex', 'odds'] as const;
export type InsightKind = typeof INSIGHT_KINDS[number];
export const INSIGHT_LABELS: Record<InsightKind, string> = { predictions: 'League predictions', predictor: 'Game model projection', probabilities: 'Game / live probabilities', powerindex: 'Power index', odds: 'Bookmaker odds' };
export type InsightValue = { label: string; value: string; teamId: string | null };
export type InsightSection = {
  kind: InsightKind; status: 'ready' | 'empty' | 'unsupported' | 'unavailable' | 'skipped';
  values: InsightValue[]; observedAt: string | null; truncated: boolean; message: string | null;
  url: string | null; httpStatus: number | null; errorKind?: EspnFailureKind; responseMetadata?: EspnResponseMetadata;
};
export type InsightsBoard = { reference: MatchReference; fetchedAt: string; matchState: string | null; status: 'ready' | 'partial' | 'unavailable'; sections: InsightSection[] };
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const num = (v: unknown): number | null => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) ? Number(v) : null;
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const percent = (v: unknown, scale: 1 | 100): number | null => { const n = num(v); return n !== null && n >= 0 && n <= scale ? n * 100 / scale : null; };

/** Fixed catalog paths only. A competition ID must be reported, never assumed equal to the event ID. */
export function insightUrls(match: MatchDetails): Record<InsightKind, string | null> {
  const { meta } = resolveMatch(match.reference.league, match.reference.eventId);
  const base = 'https://sports.core.api.espn.com';
  const competition = match.competitionId && matchReference(match.reference.league, match.competitionId) ? `${base}/v2/sports/${meta.sport}/leagues/${meta.league}/events/${match.reference.eventId}/competitions/${match.competitionId}` : null;
  return {
    predictions: `${base}/v3/sports/${meta.sport}/${meta.league}/predictions?eventId=${match.reference.eventId}&limit=50`,
    predictor: competition ? `${competition}/predictor` : null,
    probabilities: competition ? `${competition}/probabilities?limit=100` : null,
    powerindex: competition ? `${competition}/powerindex` : null,
    odds: competition ? `${competition}/odds?limit=50` : null,
  };
}
function checkIdentity(root: Record<string, unknown>, match: MatchDetails) {
  const league = text(obj(root.league).slug);
  if (league && league !== resolveMatch(match.reference.league, match.reference.eventId).meta.league) throw new Error('ESPN insight competition mismatch');
  const event = text(root.eventId) ?? text(obj(root.event).id);
  for (const side of ['home', 'away']) {
    const id = text(obj(obj(root[`${side}Team`]).team).id) ?? text(obj(root[`${side}Team`]).id);
    if (id && id !== match.teams.find((team) => team.side === side)?.id) throw new Error('ESPN insight team mismatch');
  }
  const competition = text(root.competitionId) ?? text(obj(root.competition).id);
  if (event && event !== match.reference.eventId || competition && competition !== match.competitionId) throw new Error('ESPN insight identity mismatch');
}

/** Conservative inline adapters: unknown/reference-only formats stay unsupported, never invented. */
export function parseInsight(kind: InsightKind, payload: unknown, match: MatchDetails): Pick<InsightSection, 'status' | 'values' | 'observedAt' | 'truncated' | 'message'> {
  const root = obj(payload); checkIdentity(root, match);
  const rows = list(root.items).slice(0, 100);
  const truncated = list(root.items).length > rows.length || typeof root.count === 'number' && root.count > rows.length || list(root.teams).length > 20;
  let observedAt = date(root.lastModified); const values: InsightValue[] = [];
  let recognized = false;
  if (kind === 'predictor' || kind === 'predictions') {
    let model = root;
    if (kind === 'predictions') {
      // A league-level response must identify this event even when a query filter was sent.
      const candidates = Array.isArray(root.items) ? rows : [root];
      const matches = candidates.map(obj).filter((item) => (text(item.eventId) ?? text(obj(item.event).id)) === match.reference.eventId);
      if (matches.length !== 1) return { status: Array.isArray(root.items) && (!rows.length || !matches.length && rows.some((row) => text(obj(row).eventId) ?? text(obj(obj(row).event).id))) ? 'empty' : 'unsupported', values, observedAt, truncated, message: 'No unambiguous matching game projection was supplied in this response.' };
      checkIdentity(matches[0], match); model = Object.keys(obj(matches[0].predictor)).length ? obj(matches[0].predictor) : matches[0];
      observedAt = date(matches[0].lastModified) ?? observedAt;
    }
    let total = 0;
    for (const side of ['home', 'away'] as const) {
      const data = obj(model[`${side}Team`]); const id = text(obj(data.team).id) ?? text(data.id);
      const team = match.teams.find((team) => team.side === side);
      if (id && id !== team?.id) throw new Error('ESPN model team mismatch');
      if (!id || !team) continue;
      const projection = data.gameProjection ?? obj(list(data.statistics).find((stat) => obj(stat).name === 'gameProjection')).value;
      if (projection === undefined || projection === null) continue;
      const p = percent(projection, 100); if (p === null) throw new Error('Invalid game projection');
      recognized = true; total += p; values.push({ label: team.name.slice(0, 1000), value: `${Number(p.toFixed(3))}%`, teamId: team.id });
    }
    if (total > 100.5) throw new Error('Inconsistent projections');
  } else if (kind === 'probabilities') {
    const inline = (Array.isArray(root.items) ? rows : [root]).map(obj).filter((row) => ['homeWinPercentage', 'awayWinPercentage', 'tiePercentage'].some((key) => row[key] !== undefined));
    // Multiple plays are only ordered by explicit timestamps, never by array position.
    const dated = inline.filter((row) => date(row.lastModified)).sort((a, b) => Date.parse(String(b.lastModified)) - Date.parse(String(a.lastModified)));
    const row = inline.length === 1 ? inline[0] : dated[0];
    if (row) {
      checkIdentity(row, match); observedAt = date(row.lastModified);
      let total = 0;
      for (const [key, side] of [['homeWinPercentage', 'home'], ['awayWinPercentage', 'away'], ['tiePercentage', 'tie']] as const) {
        if (row[key] === undefined || row[key] === null) continue;
        const p = percent(row[key], 1); if (p === null) throw new Error('Invalid probability scale'); total += p;
        const team = match.teams.find((team) => team.side === side);
        if (side !== 'tie' && !team) continue;
        values.push({ label: team?.name.slice(0, 1000) ?? 'Tie / draw (provider definition)', value: `${Number(p.toFixed(3))}%`, teamId: team?.id ?? null });
      }
      if (total > 100.5) throw new Error('Inconsistent probabilities'); recognized = values.length > 0;
    }
  } else if (kind === 'powerindex') {
    const teams = Array.isArray(root.teams) ? list(root.teams).slice(0, 20) : rows;
    for (const raw of teams) {
      const block = obj(raw); const id = text(obj(block.team).id); const team = match.teams.find((team) => team.id === id);
      if (!team) continue;
      for (const rawStat of list(block.stats ?? block.statistics).slice(0, 20)) {
        if (values.length >= 40) break;
        const stat = obj(rawStat); const label = text(stat.displayName) ?? text(stat.name); const value = text(stat.displayValue) ?? text(stat.value);
        if (label && value) values.push({ label: `${team.name} · ${label}`.slice(0, 1000), value, teamId: team.id });
      }
    }
    recognized = values.length > 0;
  } else {
    for (const row of Array.isArray(root.items) ? rows : [root]) {
      checkIdentity(obj(row), match);
      const odds = mapOdds({ odds: [row] });
      if (odds.home === null && odds.away === null && odds.draw === null && odds.spread === null && odds.over_under === null) continue;
      for (const [label, value] of [['Home decimal', odds.home], ['Away decimal', odds.away], ['Draw decimal', odds.draw], ['Spread', odds.spread], ['Total (O/U)', odds.over_under]] as const) if (value !== null) values.push({ label: `${odds.provider ?? 'Provider unspecified'} · ${label}`, value: String(value), teamId: null });
      recognized = true; break; // Never mix bookmakers or manufacture absent markets.
    }
  }
  return { status: recognized ? 'ready' : Array.isArray(root.items) && rows.length === 0 ? 'empty' : 'unsupported', values, observedAt, truncated,
    message: recognized ? null : 'No supported inline data was supplied. Reference-only and unknown formats are not followed or guessed.' };
}

export function isInsightsBoard(value: unknown, reference: MatchReference): value is InsightsBoard {
  const board = obj(value); const ref = obj(board.reference);
  const safeSource = (v: unknown) => { if (v === null) return true; try { const url = new URL(String(v)); return url.origin === 'https://sports.core.api.espn.com' && !url.username && !url.password; } catch { return false; } };
  const nullableText = (v: unknown) => v === null || typeof v === 'string';
  return ref.league === reference.league && ref.eventId === reference.eventId && ['ready', 'partial', 'unavailable'].includes(String(board.status))
    && typeof board.fetchedAt === 'string' && !!date(board.fetchedAt) && nullableText(board.matchState)
    && Array.isArray(board.sections) && board.sections.length === INSIGHT_KINDS.length
    && INSIGHT_KINDS.every((kind, index) => obj(list(board.sections)[index]).kind === kind)
    && board.sections.every((raw) => {
      const section = obj(raw);
      return ['ready', 'empty', 'unsupported', 'unavailable', 'skipped'].includes(String(section.status))
        && nullableText(section.url) && safeSource(section.url) && (section.httpStatus === null || typeof section.httpStatus === 'number')
        && nullableText(section.message) && (section.observedAt === null || typeof section.observedAt === 'string' && !!date(section.observedAt)) && typeof section.truncated === 'boolean'
        && Array.isArray(section.values) && section.values.length <= 40 && (section.status === 'ready' ? section.values.length > 0 : section.values.length === 0)
        && section.values.every((raw) => { const row = obj(raw); return typeof row.label === 'string' && row.label.length <= 1000 && typeof row.value === 'string' && row.value.length <= 200 && nullableText(row.teamId); });
    });
}
