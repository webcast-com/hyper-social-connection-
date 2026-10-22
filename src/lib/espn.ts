import type { EspnLeague } from './sports-catalog';
import type { EventStatus, SportsEvent, SportsTeam } from './sports';

function score(value: unknown): number | null {
  if (value && typeof value === 'object') {
    const object = value as { value?: unknown; displayValue?: unknown };
    return score(object.value ?? object.displayValue);
  }
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function team(competitor: any): SportsTeam | null {
  const name = competitor?.team?.displayName || competitor?.team?.name;
  if (typeof name !== 'string' || !name.trim()) return null;
  return {
    name, short: competitor.team.abbreviation,
    logo: competitor.team.logo || competitor.team.logos?.[0]?.href || null,
    score: score(competitor.score),
  };
}

/** Normalize scoreboards, not standings; missing/invalid payloads are failures. */
export function parseEspnEvents(payload: any, meta: EspnLeague): SportsEvent[] {
  if (!Array.isArray(payload?.events)) throw new Error('Invalid ESPN scoreboard response: events array missing');
  const out: SportsEvent[] = [];
  for (const event of payload.events) {
    const competitions = Array.isArray(event?.competitions) ? event.competitions : [];
    for (const [index, competition] of competitions.entries()) {
      if (!competition) continue;
      const id = event.id || competition.id;
      const date = competition.date || event.date;
      if (!id || typeof date !== 'string' || !Number.isFinite(new Date(date).getTime())) continue;
      const statusData = competition.status || event.status;
      const state = statusData?.type?.state;
      const status: EventStatus = statusData?.type?.completed || state === 'post' ? 'final' : state === 'in' ? 'live' : 'upcoming';
      const detail = statusData?.type?.shortDetail || statusData?.displayClock || statusData?.type?.detail || null;
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const common = {
        id: `espn-${meta.slug}-${id}${competitions.length > 1 ? `-${competition.id || index}` : ''}`,
        source: 'espn' as const, sport: meta.kind, league: meta.slug,
        leagueName: payload.leagues?.[0]?.name || meta.name,
        startAt: new Date(date).toISOString(), status, detail,
        venue: competition.venue?.fullName || competition.circuit?.fullName || null,
        url: event.links?.[0]?.href || null,
      };
      if (meta.kind === 'motorsport') {
        const entries = competitors.flatMap((competitor: any) => {
          const name = competitor?.athlete?.displayName || competitor?.athlete?.fullName || competitor?.team?.displayName;
          if (!name) return [];
          const position = score(competitor.order ?? competitor.position);
          return [{ name: String(name), position: position !== null && position > 0 ? position : null }];
        }).sort((a: { position: number | null }, b: { position: number | null }) => (a.position ?? Infinity) - (b.position ?? Infinity));
        const title = [event.name || event.shortName || meta.name, competition.type?.text].filter(Boolean).join(' · ');
        out.push({
          ...common, race: { title, entries },
          // Compatibility fields; race-aware views never render these as a match.
          home: { name: entries[0]?.name || title }, away: { name: entries[1]?.name || 'Field' },
        });
        continue;
      }
      const reportedHome = competitors.find((item: any) => item?.homeAway === 'home');
      const reportedAway = competitors.find((item: any) => item?.homeAway === 'away');
      const homeRaw = reportedHome || competitors.find((item: any) => item && item !== reportedAway);
      const awayRaw = reportedAway || competitors.find((item: any) => item && item !== homeRaw);
      const home = team(homeRaw);
      const away = team(awayRaw);
      if (home && away) out.push({ ...common, home, away });
    }
  }
  return out;
}
