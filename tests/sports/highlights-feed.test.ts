import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSportsHighlights } from '../../src/lib/espn-highlights-feed';
import { getSportsBoard } from '../../src/lib/sports';

async function withFetch(run: () => Promise<void>, respond: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

/** A scoreboard payload for one league, in the shape the Site API sends. */
const scoreboard = (eventId: string, name: string, state: string) => ({
  events: [{
    id: eventId,
    date: '2026-11-08T18:00:00Z',
    competitions: [{
      status: { type: { state, shortDetail: state === 'in' ? 'Live' : 'Final' } },
      competitors: [
        { homeAway: 'home', team: { displayName: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${eventId}.png` }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Visitors', abbreviation: 'VIS' }, score: '1' },
      ],
    }],
  }],
});

const summary = (clips: unknown[]) => ({ videos: clips });

const clip = (id: string, title: string) => ({
  id,
  title,
  duration: 42,
  thumbnails: [{ href: `https://a.espncdn.com/media/2026/0907/${id}.jpg` }],
  source: { href: `https://a.espncdn.com/media/video/2026/0907/${id}_3600k.mp4` },
});

/**
 * The board cache is shared with the page, so seed it once with a known set of
 * fixtures. After that the feed's own board read is free and the only requests
 * left are the game summaries under test.
 */
async function seedBoard() {
  await withFetch(async () => {
    await getSportsBoard();
  }, async (input) => {
    const url = String(input);
    if (url.includes('/soccer/eng.1/scoreboard')) return Response.json(scoreboard('401111111', 'Arsenal', 'post'));
    if (url.includes('/football/nfl/scoreboard')) return Response.json(scoreboard('401222222', 'Chiefs', 'in'));
    return Response.json({ events: [] });
  });
}

test('highlights come from ESPN game summaries and keep their fixture', async () => {
  await seedBoard();
  const urls: string[] = [];
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'live');
    assert.equal(board.games, 2, 'one summary per competition');
    assert.equal(board.clips.length, 2);
    // Live fixtures come first, so the NFL clip leads the board.
    const [nfl, epl] = board.clips;
    assert.equal(epl.title, 'Saka scores');
    assert.equal(epl.mp4, 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4');
    assert.equal(epl.thumbnail, 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    assert.equal(epl.duration, 42);
    assert.equal(epl.playable, true);
    assert.equal(epl.eventName, 'Arsenal vs Visitors');
    assert.equal(epl.home, 'Arsenal');
    assert.equal(epl.homeLogo, 'https://a.espncdn.com/i/teamlogos/soccer/500/401111111.png');
    assert.equal(epl.status, 'final');
    assert.equal(epl.league, 'epl');
    assert.equal(epl.leagueName, 'Premier League');
    assert.equal(nfl.title, 'Mahomes finds Kelce');
    assert.equal(nfl.status, 'live');
    assert.equal(nfl.league, 'nfl');
    assert.equal(nfl.league, 'nfl');
    assert.equal(nfl.eventName, 'Chiefs vs Visitors');
    // The board id is namespaced; the summary endpoint wants ESPN's own id.
    assert.ok(urls.some((url) => url.endsWith('/soccer/eng.1/summary?event=401111111')), urls.join(', '));
    assert.ok(urls.some((url) => url.endsWith('/football/nfl/summary?event=401222222')), urls.join(', '));
    assert.ok(urls.every((url) => new URL(url).hostname === 'site.api.espn.com'));
  }, async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/soccer/eng.1/summary')) return Response.json(summary([clip('49861382', 'Saka scores')]));
    if (url.includes('/football/nfl/summary')) return Response.json(summary([clip('49861383', 'Mahomes finds Kelce')]));
    throw new Error(`unexpected fetch ${url}`);
  });
});

test('a partial board is reported as partial, not as live', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'partial');
    assert.equal(board.clips.length, 1);
    assert.equal(board.clips[0].title, 'Saka scores');
  }, async (input) => {
    const url = String(input);
    if (url.includes('/soccer/eng.1/summary')) return Response.json(summary([clip('49861382', 'Saka scores')]));
    throw new Error(`summary failed for ${url}`);
  });
});

test('when ESPN does not answer the board falls back to the bundled sample clips', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'unavailable');
    assert.equal(board.source.ok, false);
    assert.match(board.source.error!, /site\.api\.espn\.com|failed|timed out|unreachable/i);
    assert.ok(board.clips.length >= 4);
    // No invented ESPN media is served as if it were real.
    assert.ok(board.clips.every((entry) => entry.mp4 === null && entry.hls === null && entry.page === null));
    assert.ok(board.clips.every((entry) => /sample/i.test(entry.description ?? '')));
  }, async (input) => {
    throw new Error(`ESPN unreachable for ${String(input)}`);
  });
});

test('a summary with no videos falls back to the bundled sample clips', async () => {
  await seedBoard();
  await withFetch(async () => {
    const board = await getSportsHighlights(true);
    assert.equal(board.status, 'unavailable');
    assert.match(board.source.error!, /no highlight videos/i);
    assert.ok(board.clips.length >= 4);
  }, async () => Response.json({ boxscore: {}, plays: [] }));
});
