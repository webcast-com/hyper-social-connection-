import type { SportsHighlightClip, SportsHighlightStatus } from '../../src/lib/espn-highlights';
import type { SportsVideoNewsClip } from '../../src/lib/espn-video-news';
import type { StoredClip } from '../../src/lib/highlights-index';

/**
 * A made-up library of clips for the stored-list tests: a few hundred over ten
 * weeks, with the awkward cases mixed in — clips sharing a timestamp, clips
 * with no date, clips with no file, fixtures whose id carries a competition
 * suffix. Deterministic, so a failure can be reproduced.
 */

export const DAY = 86_400_000;
export const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
export const LEAGUES = ['epl', 'nba', 'ucl', 'nfl', 'laliga'];
const STATUSES: SportsHighlightStatus[] = ['final', 'final', 'final', 'live', 'upcoming'];

/** Deterministic, so a failure can be reproduced. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export const matchClip = (n: number, over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: String(48_000_000 + n),
  title: `Clip ${n}`,
  description: `What happened in clip ${n}`,
  duration: 30 + (n % 90),
  thumbnail: `https://a.espncdn.com/media/${n}.jpg`,
  mp4: `https://espnmedia-cdn.akamaized.net/espn/media/${n}.mp4`,
  hls: null,
  page: `https://www.espn.com/video/clip/_/id/${48_000_000 + n}`,
  playable: true,
  eventId: `espn-epl-${700_000 + n}`,
  eventName: `Home ${n} v Away ${n}`,
  sport: 'football',
  league: 'epl',
  leagueName: 'English Premier League',
  home: `Home ${n}`,
  away: `Away ${n}`,
  homeLogo: null,
  awayLogo: null,
  startAt: new Date(NOW - n * 3_600_000).toISOString(),
  status: 'final',
  ...over,
});

export const leagueClip = (n: number, over: Partial<SportsVideoNewsClip> = {}): SportsVideoNewsClip => ({
  id: `espn-video-epl-${49_000_000 + n}`,
  clipId: String(49_000_000 + n),
  title: `League video ${n}`,
  description: null,
  league: 'epl',
  leagueName: 'English Premier League',
  sport: 'football',
  teams: ['Arsenal', 'Brighton'],
  publishedAt: new Date(NOW - n * 5_400_000).toISOString(),
  page: `https://www.espn.com/video/clip/_/id/${49_000_000 + n}`,
  thumbnail: null,
  ...over,
});

/** A few hundred clips over ten weeks, with the awkward cases mixed in. */
export function library(seed = 7): StoredClip[] {
  const next = random(seed);
  const clips: StoredClip[] = [];
  for (let n = 1; n <= 520; n += 1) {
    // Three clips to a fixture; a fixture is in one competition.
    const fixture = 700_000 + Math.floor(n / 3);
    const league = LEAGUES[fixture % LEAGUES.length];
    // Whole hours, so several clips share a timestamp and the tie-break is used.
    const hoursAgo = Math.floor(next() * 70 * 24) - 30;
    clips.push({
      kind: 'match',
      sourceUrl: `https://site.api.espn.com/apis/site/v2/sports/x/${league}/videos?event=${fixture}`,
      clip: matchClip(n, {
        league,
        leagueName: league.toUpperCase(),
        // Every third fixture carries a competition suffix on its id.
        eventId: n % 9 === 0 ? `espn-${league}-${fixture}-${fixture + 5}` : `espn-${league}-${fixture}`,
        status: STATUSES[Math.floor(next() * STATUSES.length)],
        startAt: n % 61 === 0 ? null : new Date(NOW - hoursAgo * 3_600_000).toISOString(),
        mp4: n % 7 === 0 ? null : `https://espnmedia-cdn.akamaized.net/espn/media/${n}.mp4`,
      }),
    });
  }
  for (let n = 1; n <= 140; n += 1) {
    const league = LEAGUES[Math.floor(next() * 3)];
    clips.push({
      kind: 'league',
      sourceUrl: `https://site.api.espn.com/apis/site/v2/sports/x/${league}/news`,
      clip: leagueClip(n, {
        id: `espn-video-${league}-${49_000_000 + n}`,
        league,
        leagueName: league.toUpperCase(),
        publishedAt: n % 47 === 0 ? null : new Date(NOW - Math.floor(next() * 40 * 24) * 3_600_000).toISOString(),
      }),
    });
  }
  return clips;
}
