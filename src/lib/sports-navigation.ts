/** Geographic competition areas, not inferred from a fixture's venue or teams. */
export const COMPETITION_COUNTRIES: Record<string, string> = {
  epl: 'England', championship: 'England', wsl: 'England', 'prem-rugby': 'England',
  laliga: 'Spain', seriea: 'Italy', bundesliga: 'Germany', ligue1: 'France',
  eredivisie: 'Netherlands', primeira: 'Portugal', scottish: 'Scotland', superlig: 'Türkiye',
  'zambia': 'Zambia',
  'zimbabwe': 'Zimbabwe',
  'african-nations-championship': 'International / multi-country',
  'south-africa-mtn8': 'South Africa',
  'switzerland': 'Switzerland',
  'cyprus': 'Cyprus',
  'league-two': 'England',
  'fa-cup': 'England',
  'efl-cup': 'England',
  'womens-fa-cup': 'England',
  'bundesliga2': 'Germany',
  'german-cup': 'Germany',
  'ligue2': 'France',
  'france-women': 'France',
  'serie-b': 'Italy',
  'coppa-italia': 'Italy',
  'netherlands-second': 'Netherlands',
  'netherlands-women': 'Netherlands',
  'scottish-championship': 'Scotland',
  'portugal-cup': 'Portugal',
  'uefa-nations': 'International / multi-country',
  'womens-euro': 'International / multi-country',
  'euro-u21': 'International / multi-country',
  'costa-rica': 'Costa Rica', guatemala: 'Guatemala', honduras: 'Honduras', 'el-salvador': 'El Salvador', jamaica: 'Jamaica',
  'bolivia': 'Bolivia',
  'paraguay': 'Paraguay',
  'venezuela': 'Venezuela',
  'brazil-serie-b': 'Brazil',
  'argentina-cup': 'Argentina',
  'canada-women': 'Canada',
  'us-open-cup': 'United States',
  'usl-championship': 'United States',
  'gold-cup': 'International / multi-country',
  'concacaf-nations': 'International / multi-country',
  'womens-copa-america': 'International / multi-country',
  'saudi-kings-cup': 'Saudi Arabia',
  'asian-cup': 'International / multi-country',
  'aleague-women': 'Australia & New Zealand',
  'womens-world-cup': 'International / multi-country',
  'club-world-cup': 'International / multi-country',
  'world-cup-qualifying-europe': 'International / multi-country',
  'world-cup-qualifying-asia': 'International / multi-country',
  'world-cup-qualifying-concacaf': 'International / multi-country',
  'world-cup-qualifying-conmebol': 'International / multi-country',
  'world-cup-qualifying-ofc': 'International / multi-country',
  kenya: 'Kenya', uganda: 'Uganda', nigeria: 'Nigeria', ghana: 'Ghana',
  belgium: 'Belgium', austria: 'Austria', greece: 'Greece', denmark: 'Denmark', norway: 'Norway', sweden: 'Sweden', ireland: 'Ireland',
  'league-one': 'England', laliga2: 'Spain', 'liga-f': 'Spain',
  chile: 'Chile', colombia: 'Colombia', ecuador: 'Ecuador', peru: 'Peru', uruguay: 'Uruguay',
  china: 'China', india: 'India', thailand: 'Thailand', malaysia: 'Malaysia', indonesia: 'Indonesia', singapore: 'Singapore',
  afcon: 'International / multi-country', 'afcon-qualifying': 'International / multi-country', euro: 'International / multi-country',
  'womens-ucl': 'International / multi-country', sudamericana: 'International / multi-country', 'copa-america': 'International / multi-country',
  'concacaf-champions': 'International / multi-country', 'afc-two': 'International / multi-country', 'world-cup': 'International / multi-country',
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
