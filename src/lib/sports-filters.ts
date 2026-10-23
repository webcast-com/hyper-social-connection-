import { SPORTS_LEAGUE_PAGES, type SportsLeaguePage } from './sports-league-pages';
import { AVAILABLE_SPORTS, SPORTS_COMPETITIONS, SPORTS_REGIONS, type SportKind, type SportsRegion } from './sports-catalog';
import { competitionCountry } from './sports-navigation';

export type SportsFilters = {
  sport: SportKind | 'all'; region: SportsRegion | 'all'; country: string; league: string;
  status: 'all' | 'live' | 'upcoming' | 'final'; date: string; query: string; view: 'list' | 'cards';
};
export const DEFAULT_SPORTS_FILTERS: SportsFilters = Object.freeze({
  sport: 'all', region: 'all', country: 'all', league: 'all', status: 'all', date: 'all', query: '', view: 'list',
});

/** Validate UI/URL state independently of provider fetching. Keep compatible selections. */
export function normalizeSportsFilters(input: Partial<Record<keyof SportsFilters, unknown>>): SportsFilters {
  const sport = AVAILABLE_SPORTS.includes(input.sport as SportKind) ? input.sport as SportKind : 'all';
  const region = SPORTS_REGIONS.some((item) => item.id === input.region) ? input.region as SportsRegion : 'all';
  const available = SPORTS_COMPETITIONS.filter((item) => (sport === 'all' || item.kind === sport) && (region === 'all' || item.region === region));
  const country = typeof input.country === 'string' && available.some((item) => competitionCountry(item.slug) === input.country) ? input.country : 'all';
  const league = available.some((item) => item.slug === input.league && (country === 'all' || competitionCountry(item.slug) === country)) ? input.league as string : 'all';
  const status = input.status === 'live' || input.status === 'upcoming' || input.status === 'final' ? input.status : 'all';
  const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    && Number.isFinite(Date.parse(`${input.date}T00:00:00Z`)) && new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) === input.date ? input.date : 'all';
  return { sport, region, country, league, status, date,
    query: typeof input.query === 'string' ? input.query.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : '',
    view: input.view === 'cards' ? 'cards' : 'list' };
}

export function readSportsFilters(params: URLSearchParams): SportsFilters {
  return normalizeSportsFilters({ sport: params.get('sport'), region: params.get('region'), country: params.get('country'),
    league: params.get('league'), status: params.get('status'), date: params.get('date'), query: params.get('q'), view: params.get('view') });
}

/** Next's record form uses arrays for repeated parameters; match URLSearchParams' first-value rule. */
export function sportsFiltersFromRecord(record: Record<string, string | string[] | undefined>): SportsFilters {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === 'string') params.set(key, value[0]);
  }
  return readSportsFilters(params);
}

export function sportsFilterSearch(input: SportsFilters): string {
  const filters = normalizeSportsFilters(input);
  const params = new URLSearchParams();
  for (const key of ['sport', 'region', 'country', 'league', 'status', 'date', 'query', 'view'] as const) {
    if (filters[key] !== DEFAULT_SPORTS_FILTERS[key]) params.set(key === 'query' ? 'q' : key, filters[key]);
  }
  return params.size ? `?${params.toString()}` : '';
}
export function scopeLeagueFilters(filters: SportsFilters, league?: SportsLeaguePage): SportsFilters {
  return league ? normalizeSportsFilters({ ...filters, sport: SPORTS_LEAGUE_PAGES[league].sport, league, region: 'all', country: 'all' }) : filters;
}
export function sportsFilterHref(filters: SportsFilters, league?: SportsLeaguePage): string {
  if (!league) return `/sports${sportsFilterSearch(filters)}`;
  const params = new URLSearchParams(sportsFilterSearch(scopeLeagueFilters(filters, league)));
  for (const key of ['sport', 'league', 'region', 'country']) params.delete(key);
  return `${SPORTS_LEAGUE_PAGES[league].path}${params.size ? `?${params}` : ''}`;
}

/** Only a known local scoreboard path and whitelisted, validated filters may be returned to. */
export function safeSportsReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('/sports') || /[\u0000-\u001f\u007f]/.test(value)) return '/sports';
  try {
    const url = new URL(value, 'https://sports.invalid');
    if (url.origin !== 'https://sports.invalid') return '/sports';
    if (url.pathname === '/sports') return sportsFilterHref(readSportsFilters(url.searchParams));
    const league = (Object.keys(SPORTS_LEAGUE_PAGES) as SportsLeaguePage[]).find((key) => SPORTS_LEAGUE_PAGES[key].path === url.pathname);
    return league ? sportsFilterHref(readSportsFilters(url.searchParams), league) : '/sports';
  } catch { return '/sports'; }
}
