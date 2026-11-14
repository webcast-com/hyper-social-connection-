/**
 * One team as a page of its own, from what this site already stored.
 *
 * A team page used to be a shell: it rendered an empty board and fetched in the
 * browser, so a crawler saw a heading saying "Loading team details…" and nothing
 * else, and the page was marked `noindex` because that was the honest thing to do
 * with it. Unlike a fixture, though, nothing server-side could name the team: the
 * page is addressed by a numeric ESPN id, and this site stores no team table.
 *
 * What it does store is clips, and a clip carries both sides' names *and* both
 * sides' ESPN team ids. So the rows this site already holds answer two questions a
 * team page needs — who is this, and what have they played — without a single ESPN
 * call. That is the whole rule here: **a team page is indexable when this site can
 * server-render something about it**, and every fact comes only from stored clips.
 * Nothing is inferred from the URL, and a team with no stored clips stays the shell
 * it was, still `noindex`, still honest.
 *
 * Pure and client-safe on purpose, like `match-page.ts`: no `next/server`, no
 * Prisma, so the same facts can be asserted in a spec without a database.
 */
import { entityIdFrom } from './espn-team';
import type { SportsHighlightClip } from './espn-highlights';

/** How many opponents the description names before trailing off. Bounded so the
 * copy cannot grow without limit on a team this site holds many clips for. */
export const MAX_NAMED_OPPONENTS = 6;

/** The team, as the stored clips that mention it report it. */
export type TeamPageFacts = {
  teamName: string | null;
  leagueName: string | null;
  league: string | null;
  sport: string | null;
  /** Opponents from stored fixtures, newest first, deduplicated and capped. */
  opponents: string[];
  /** Clips this site holds that involve the team. */
  clips: number;
};

/**
 * What the stored clips for one team say about it.
 *
 * `teamName` is passed in rather than re-derived because the reader that fetched
 * the rows already worked it out, and two derivations could disagree. Null — no
 * facts at all — when there are no clips or no name: a page that cannot name the
 * team it is about has nothing worth crawling, however many clips sit behind it.
 *
 * Opponents come from the *other* side of each clip, decided by which stored id
 * matches this team's. A clip that reports neither id is skipped rather than
 * guessed at: assuming the home side is always this team would name the wrong
 * opponent for every away fixture.
 */
export function teamPageFacts(
  clips: readonly SportsHighlightClip[],
  teamId: string,
  teamName: string | null,
): TeamPageFacts | null {
  const wanted = entityIdFrom(teamId);
  const name = teamName?.trim() || null;
  if (!clips.length || !wanted || !name) return null;
  const first = (pick: (clip: SportsHighlightClip) => string | null): string | null => {
    for (const clip of clips) {
      const value = pick(clip)?.trim();
      if (value) return value;
    }
    return null;
  };
  const opponents: string[] = [];
  for (const clip of clips) {
    // Newest first already, so the first sighting of an opponent is its most
    // recent fixture — which is the order a reader expects.
    const other = clip.homeId === wanted ? clip.away : clip.awayId === wanted ? clip.home : null;
    const value = other?.trim();
    if (value && !opponents.includes(value)) opponents.push(value);
    if (opponents.length >= MAX_NAMED_OPPONENTS) break;
  }
  return {
    teamName: name,
    leagueName: first((clip) => clip.leagueName),
    league: first((clip) => clip.league),
    sport: first((clip) => clip.sport),
    opponents,
    clips: clips.length,
  };
}

/**
 * The page's title: the team and its competition, because that is what a reader
 * searches for. The catalog's competition name is the fallback when no stored clip
 * names it — a page still has to say what it is.
 */
export function teamPageTitle(facts: TeamPageFacts | null, competitionName: string): string {
  const team = facts?.teamName;
  if (!team) return `${competitionName} team details`;
  return facts?.leagueName && facts.leagueName !== competitionName
    ? `${team} — ${facts.leagueName} highlights, record and squad`
    : `${team} — highlights, record and squad`;
}

/**
 * The page's description: the team, the competition, how many clips this site holds
 * for it, which opponents those clips came against, and what the page loads beyond
 * them. The count and the opponents are facts this site can stand behind; the
 * record and squad are what the page fetches from ESPN in the browser, and saying
 * so is more accurate than implying they are already here.
 *
 * No result, score or date is ever asserted. A stored clip proves a fixture
 * happened and that this site holds highlights from it — nothing more, and a
 * description that claimed a scoreline would be inventing one.
 */
export function teamPageDescription(facts: TeamPageFacts | null, competitionName: string): string {
  if (!facts?.teamName) {
    return `ESPN-reported record, fixtures and squad for this ${competitionName} team on Hyper.`;
  }
  const team = facts.teamName;
  const competition = facts.leagueName && facts.leagueName !== competitionName ? facts.leagueName : competitionName;
  const stored = `${facts.clips} highlight ${facts.clips === 1 ? 'clip' : 'clips'} stored from fixtures involving this team`;
  const against = facts.opponents.length
    ? `, against ${facts.opponents.join(', ')}`
    : '';
  return `${team} in the ${competition}: ${stored}${against}, plus the ESPN-reported record, fixtures and squad on Hyper.`;
}

/** The trail to a team: home, sport, the competition's board, then the team. */
export function teamBreadcrumbFor(
  facts: TeamPageFacts | null,
  origin: string,
  competitionName: string,
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
      // The last crumb is this page, and schema.org wants it without an item —
      // same shape `matchBreadcrumbFor` uses, so both trails validate alike.
      { '@type': 'ListItem', position: 4, name: facts?.teamName ?? `${competitionName} team` },
    ],
  };
}
