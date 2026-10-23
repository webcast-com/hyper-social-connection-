/** Geographic competition areas, not inferred from a fixture's venue or teams. */
export const COMPETITION_COUNTRIES: Record<string, string> = {
  epl: 'England', championship: 'England', wsl: 'England', 'prem-rugby': 'England',
  laliga: 'Spain', seriea: 'Italy', bundesliga: 'Germany', ligue1: 'France',
  eredivisie: 'Netherlands', primeira: 'Portugal', scottish: 'Scotland', superlig: 'Türkiye',
  'south-africa': 'South Africa', 'liga-mx': 'Mexico', brasileirao: 'Brazil', argentina: 'Argentina',
  jleague: 'Japan', saudi: 'Saudi Arabia', aleague: 'Australia & New Zealand',
  nwsl: 'United States', mls: 'United States & Canada', nba: 'United States & Canada', wnba: 'United States & Canada',
  ncaam: 'United States', ncaaw: 'United States', nfl: 'United States', mlb: 'United States & Canada', nhl: 'United States & Canada',
  ucl: 'International / multi-country', uel: 'International / multi-country', uecl: 'International / multi-country',
  caf: 'International / multi-country', 'caf-confed': 'International / multi-country', 'caf-world-cup': 'International / multi-country',
  libertadores: 'International / multi-country', afc: 'International / multi-country', 'super-rugby': 'International / multi-country', f1: 'International / multi-country',
};
export function competitionCountry(slug: string): string | undefined { return Object.prototype.hasOwnProperty.call(COMPETITION_COUNTRIES, slug) ? COMPETITION_COUNTRIES[slug] : undefined; }

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar filtering only considers loaded fixtures, consistently in EAT. */
export function sportsDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return dateFormatter.format(date);
}

/** Only compare two reported non-negative scalars with matching units. */
export function statisticShare(values: (string | null | undefined)[]): number | null {
  if (values.length !== 2 || values.some((value) => !value || !/^\d+(?:\.\d+)?%?$/.test(value))) return null;
  const [a, b] = values as [string, string];
  if (a.endsWith('%') !== b.endsWith('%')) return null;
  const left = Number.parseFloat(a); const right = Number.parseFloat(b);
  return Number.isFinite(left + right) && left + right > 0 ? left / (left + right) * 100 : null;
}
