/**
 * One fixture as a page of its own, from what this site already stored.
 *
 * A match page used to be a shell: it rendered an empty board and fetched in the
 * browser, so a crawler that arrived saw a heading and no content, and the page was
 * marked `noindex` because that was the honest thing to do with it. But every clip
 * this site has swept carries the fixture's own reported facts — the two sides, the
 * competition, when it started — so a fixture with stored clips has something true
 * to say before any browser fetch happens.
 *
 * That is the whole rule here: **a match page is indexable when this site can
 * server-render something about it**, and the facts come only from stored clips.
 * Nothing is inferred from the URL, and a fixture with no stored clips stays the
 * shell it was, still `noindex`, still honest.
 */
import type { SportsHighlightClip } from './espn-highlights';

/** The fixture, as its own stored clips report it. */
export type MatchPageFacts = {
  eventName: string | null;
  leagueName: string | null;
  league: string | null;
  sport: string | null;
  home: string | null;
  away: string | null;
  /** When the fixture started, as the scoreboard reported it. */
  startAt: string | null;
  /** Clips this site holds for the fixture. */
  clips: number;
};

/**
 * What a fixture's own stored clips say about it.
 *
 * `clips` is newest first, so the first row is the most recent report; a fact is
 * taken from the newest clip that has it, because a later clip can carry a detail
 * an earlier one did not. Null when there is nothing stored, which is the case that
 * keeps the page a shell.
 */
export function matchPageFacts(clips: readonly SportsHighlightClip[]): MatchPageFacts | null {
  if (!clips.length) return null;
  const first = (pick: (clip: SportsHighlightClip) => string | null): string | null => {
    for (const clip of clips) {
      const value = pick(clip)?.trim();
      if (value) return value;
    }
    return null;
  };
  return {
    eventName: first((clip) => clip.eventName),
    leagueName: first((clip) => clip.leagueName),
    league: first((clip) => clip.league),
    sport: first((clip) => clip.sport),
    home: first((clip) => clip.home),
    away: first((clip) => clip.away),
    startAt: first((clip) => clip.startAt),
    clips: clips.length,
  };
}

/**
 * The page's title.
 *
 * The fixture and its competition, because that is what a reader searches for, and
 * the competition the catalog reports as the fallback when no stored clip names the
 * fixture — a page still has to say what it is.
 */
export function matchPageTitle(facts: MatchPageFacts | null, competitionName: string): string {
  const fixture = facts?.eventName;
  if (!fixture) return `${competitionName} match details`;
  return facts?.leagueName && facts.leagueName !== fixture
    ? `${fixture} — ${facts.leagueName} highlights and match stats`
    : `${fixture} highlights and match stats`;
}

/**
 * The page's description: the fixture, the competition, how many clips this site
 * holds for it, and what the page loads beyond them. The count is a fact this site
 * can stand behind; the statistics and lineups are what the page fetches from ESPN
 * in the browser, and saying so is more accurate than implying they are already
 * here.
 */
export function matchPageDescription(facts: MatchPageFacts | null, competitionName: string): string {
  if (!facts) {
    return 'ESPN-reported match statistics, lineups, player stats and match events on Hyper.';
  }
  const fixture = facts.eventName ?? competitionName;
  // The competition is named alongside the fixture, never instead of it: when no
  // clip reported the fixture the page is already headed by its competition, and
  // saying it twice reads like filler.
  const competition = facts.eventName && facts.leagueName && facts.leagueName !== fixture
    ? ` in the ${facts.leagueName}`
    : '';
  const stored = `${facts.clips} highlight ${facts.clips === 1 ? 'clip' : 'clips'} stored from this fixture`;
  return `${fixture}${competition}: ${stored}, plus ESPN-reported statistics, lineups and match events on Hyper.`;
}

/**
 * This fixture as a `SportsEvent`.
 *
 * Null unless the name, the start time and both sides were reported: those are the
 * fields that make the type mean anything, and a fixture missing one is still a real
 * page — it simply does not claim to be structured data.
 */
export function sportsEventObjectFor(
  facts: MatchPageFacts | null,
  origin: string,
  href: string,
): Record<string, unknown> | null {
  if (!facts?.eventName || !facts.startAt || !facts.home || !facts.away) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: facts.eventName,
    startDate: facts.startAt,
    ...(facts.sport ? { sport: facts.sport } : {}),
    url: new URL(href, origin).toString(),
    competitor: [
      { '@type': 'SportsTeam', name: facts.home },
      { '@type': 'SportsTeam', name: facts.away },
    ],
  };
}

/** The trail to a fixture: home, sport, the competition's board, then the match. */
export function matchBreadcrumbFor(
  facts: MatchPageFacts | null,
  origin: string,
  competitionName: string,
  href: string,
): Record<string, unknown> {
  const at = (path: string) => new URL(path, origin).toString();
  const board = facts?.league ? `/sports?league=${encodeURIComponent(facts.league)}` : '/sports';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: at('/') },
      { '@type': 'ListItem', position: 2, name: 'Sports', item: at('/sports') },
      { '@type': 'ListItem', position: 3, name: facts?.leagueName ?? competitionName, item: at(board) },
      // The last crumb is this page, and schema.org wants it without an item.
      { '@type': 'ListItem', position: 4, name: facts?.eventName ?? `${competitionName} match` },
    ],
  };
}
