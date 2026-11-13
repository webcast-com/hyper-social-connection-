import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INDEX_LIMIT, INDEX_EMPTY, INDEX_UNAVAILABLE, MAX_INDEX_DAYS, MAX_INDEX_LIMIT,
  clipKey, clipRow, findStoredHighlightClip, findStoredNewsMedia, highlightsStore, insertSql, leagueRow, matchRow,
  newsClipsNeedingMedia, storeNewsMedia,
  probeKey, resolveIndexQuery, rowToLeagueClip, rowToMatchClip, sweepCellKey, uniqueRows,
  type ClipRow, type StoredClip, type StoredMatchClip,
} from '../../src/lib/highlights-index';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import type { SportsVideoNewsClip, SportsVideoNewsMedia } from '../../src/lib/espn-video-news';

/**
 * The stored highlights index: keys, rows, the INSERT that writes them, the
 * mapping that reads them back, and the rule that none of it touches a database
 * that is not there.
 *
 * This is the part worth testing without Postgres, because a column written wrong
 * is a clip that can never be rendered again: retention here is permanent, so a
 * bad row is not a bad moment, it is a bad record.
 */

const matchClip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '49861382',
  title: 'Saka opens the scoring',
  description: 'A curled finish from the edge of the box.',
  duration: 47,
  thumbnail: 'https://a.espncdn.com/media/2026/0907/49861382.jpg',
  mp4: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/0907/49861382_3600k.mp4',
  hls: null,
  page: 'https://www.espn.com/video/clip/_/id/49861382',
  playable: true,
  eventId: 'espn-epl-401111111',
  eventName: 'Arsenal vs Chelsea',
  sport: 'football',
  league: 'epl',
  leagueName: 'Premier League',
  home: 'Arsenal',
  away: 'Chelsea',
  homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
  awayLogo: null,
  startAt: '2026-11-08T18:00:00.000Z',
  status: 'final',
  ...over,
});

const leagueClip = (over: Partial<SportsVideoNewsClip> = {}): SportsVideoNewsClip => ({
  id: 'espn-video-epl-31053444',
  clipId: '31053444',
  title: 'Arsenal 2-1 Chelsea | Premier League highlights',
  description: 'Goals from the north London derby.',
  league: 'epl',
  leagueName: 'Premier League',
  sport: 'football',
  teams: ['Arsenal', 'Chelsea'],
  publishedAt: '2026-11-08T19:40:00.000Z',
  page: 'https://www.espn.com/video/clip/_/id/31053444',
  thumbnail: 'https://a.espncdn.com/media/2026/1108/31053444.jpg',
  ...over,
});

const stored = (clip: SportsHighlightClip, sourceUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/videos?event=401111111'): StoredMatchClip =>
  ({ kind: 'match', clip, sourceUrl });

test('a clip and a game each have one identity, and only a real one', () => {
  assert.equal(clipKey('match', matchClip()), 'match:49861382');
  assert.equal(clipKey('league', leagueClip()), 'league:espn-video-epl-31053444');
  assert.equal(clipKey('match', null), null);
  assert.equal(clipKey('match', { id: '   ' }), null, 'a blank id is not an identity');
  assert.equal(clipKey('match', { id: 'x'.repeat(600) }), null, 'an absurd id is not stored');

  // The provider's numeric event id is what a collection URL is built from, so a
  // fixture without one can never be asked and is never recorded as asked.
  assert.equal(probeKey({ league: 'epl', sourceId: '401111111' }), 'probe:epl:401111111');
  assert.equal(probeKey({ league: 'epl', sourceId: null }), null);
  assert.equal(probeKey({ league: 'epl', sourceId: 'not-numeric' }), null);
  assert.equal(probeKey({ league: 'epl', sourceId: '401111111; DROP TABLE' }), null);
  assert.equal(probeKey({ league: '', sourceId: '401111111' }), null);
  assert.equal(probeKey(null), null);

  assert.equal(sweepCellKey('epl', '20261110'), 'sweep:epl:20261110');
});

test('a query is clamped before it can reach SQL', () => {
  const resolved = resolveIndexQuery({ league: 'epl', status: 'final', days: 7, limit: 12, offset: 24 });
  assert.deepEqual(resolved, {
    kind: null, league: 'epl', status: 'final',
    since: new Date(resolved.since!.getTime()), limit: 12, offset: 24,
  });
  assert.ok(resolved.since instanceof Date);
  assert.ok(Date.now() - resolved.since!.getTime() > 6 * 86_400_000);

  // An unknown competition or state is dropped rather than queried: a page never
  // turns an arbitrary string into a filter.
  assert.equal(resolveIndexQuery({ league: 'not-a-league' }).league, null);
  assert.equal(resolveIndexQuery({ league: 'epl; DROP TABLE' }).league, null);
  assert.equal(resolveIndexQuery({ status: 'cached' as never }).status, null);
  assert.equal(resolveIndexQuery({ status: 'live' }).status, 'live');
  assert.equal(resolveIndexQuery({ kind: 'match' }).kind, 'match');
  assert.equal(resolveIndexQuery({ kind: 'everything' as never }).kind, null);

  // Bounds: a page is at most 60 clips, an age filter at most a year, and nothing
  // negative or fractional reaches the database.
  assert.equal(resolveIndexQuery({}).limit, DEFAULT_INDEX_LIMIT);
  assert.equal(resolveIndexQuery({ limit: 10_000 }).limit, MAX_INDEX_LIMIT);
  assert.equal(resolveIndexQuery({ limit: 0 }).limit, 1);
  assert.equal(resolveIndexQuery({ limit: -5 }).limit, 1);
  assert.equal(resolveIndexQuery({ limit: 12.9 }).limit, 12);
  assert.equal(resolveIndexQuery({ limit: Number.NaN }).limit, DEFAULT_INDEX_LIMIT);
  assert.equal(resolveIndexQuery({ offset: -1 }).offset, 0);
  assert.equal(resolveIndexQuery({ offset: 10 ** 9 }).offset, 100_000);
  const furthest = resolveIndexQuery({ days: 99_999 }).since!.getTime();
  assert.ok(Math.abs(furthest - (Date.now() - MAX_INDEX_DAYS * 86_400_000)) < 2_000,
    'storage is permanent, but an age filter reaches back a year at most');
  assert.equal(resolveIndexQuery({ days: 0 }).since, null, 'no age filter means no age filter');
});

test('a match clip is stored with its fixture, and only when there is something to show', () => {
  const row = matchRow(stored(matchClip()))!;
  assert.equal(row.external_key, 'match:49861382');
  assert.equal(row.kind, 'match');
  assert.equal(row.clip_id, '49861382');
  assert.equal(row.title, 'Saka opens the scoring');
  assert.equal(row.league, 'epl');
  assert.equal(row.league_name, 'Premier League');
  assert.equal(row.home, 'Arsenal');
  assert.equal(row.away, 'Chelsea');
  assert.equal(row.status, 'final');
  assert.equal(row.event_id, 'espn-epl-401111111');
  assert.equal(row.playable, true);
  assert.equal(row.occurred_at instanceof Date, true);
  assert.equal(row.source_url, 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/videos?event=401111111');
  assert.ok(row.anchor_key, 'the anchor id is stored, so engagement can find this clip later');

  // Nothing to play and nowhere to send a reader: not a clip, so not a row.
  assert.equal(matchRow(stored(matchClip({ mp4: null, hls: null, page: null }))), null);
  assert.equal(matchRow(stored(matchClip({ title: '' }))), null);
  assert.equal(matchRow(stored(matchClip({ league: 'not-a-league' }))), null, 'a competition this site does not cover is not stored');
  assert.equal(matchRow(stored(matchClip({ status: 'cached' as never }))), null,
    'a fourth match state is refused at the door, not stored as a row that could never render');

  // A non-https or lookalike URL is dropped, not stored.
  assert.equal(matchRow(stored(matchClip({ mp4: 'http://espn.example/clip.mp4' })))!.mp4, null);
  assert.equal(matchRow(stored(matchClip({ page: 'javascript:alert(1)' })))!.page, null);

  // Playability is derived from the URLs actually stored, never taken on trust: an
  // HLS-only clip cannot play in every browser and says so.
  assert.equal(matchRow(stored(matchClip({ mp4: null, hls: 'https://espn.example/clip.m3u8', playable: true })))!.playable, false);
  // A duration that is not a plausible number of seconds is dropped.
  assert.equal(matchRow(stored(matchClip({ duration: -3 })))!.duration, null);
  assert.equal(matchRow(stored(matchClip({ duration: 10 ** 6 })))!.duration, null);
});

test('a league clip is stored without a fixture, because it has none', () => {
  const row = leagueRow({ kind: 'league', clip: leagueClip(), sourceUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news?limit=20' })!;
  assert.equal(row.external_key, 'league:espn-video-epl-31053444');
  assert.equal(row.kind, 'league');
  assert.equal(row.clip_id, '31053444');
  assert.equal(row.event_id, null, 'no fixture is invented for a league clip');
  assert.equal(row.event_name, null);
  assert.equal(row.home, null);
  assert.equal(row.away, null);
  assert.equal(row.home_logo, null);
  assert.equal(row.status, null, 'so it is never offered under a match state');
  assert.equal(row.playable, false, 'its rendition is resolved only when a reader presses play');
  assert.equal(row.anchor_key, null, 'league video gets no anchor post');
  assert.deepEqual(JSON.parse(row.teams!), ['Arsenal', 'Chelsea'], 'only the labels ESPN reported');
  assert.equal(row.occurred_at instanceof Date, true);

  assert.equal(leagueRow({ kind: 'league', clip: leagueClip({ page: '' }), sourceUrl: null }), null, 'the clip page is its identity');
  assert.equal(leagueRow({ kind: 'league', clip: leagueClip({ teams: [] }), sourceUrl: null })!.teams, null);
  const many = leagueRow({ kind: 'league', clip: leagueClip({ teams: Array.from({ length: 40 }, (_, index) => `Team ${index}`) }), sourceUrl: null })!;
  assert.equal(JSON.parse(many.teams!).length, 8, 'a bounded list of labels');
  // A clip kind is decided by the caller, and `clipRow` routes it.
  assert.equal(clipRow(stored(matchClip()))!.kind, 'match');
  assert.equal(clipRow({ kind: 'league', clip: leagueClip() })!.kind, 'league');
});

test('a league clip stores the rendition resolved for it, and plays', () => {
  const media: SportsVideoNewsMedia = {
    mp4: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1108/31053444_3600k.mp4',
    hls: 'https://espnmedia-cdn.akamaized.net/espn/media/16x9/2026/1108/31053444.m3u8',
    page: 'https://www.espn.com/video/clip/_/id/31053444',
    thumbnail: 'https://a.espncdn.com/media/2026/1108/31053444-resolved.jpg',
    duration: 94,
  };
  const row = leagueRow({ kind: 'league', clip: leagueClip(), sourceUrl: null, media })!;
  assert.equal(row.mp4, media.mp4, 'the rendition is stored beside the clip, not left in memory to die on deploy');
  assert.equal(row.hls, media.hls);
  assert.equal(row.duration, 94);
  assert.equal(row.playable, true, 'playable exactly when a rendition was resolved, the rule a match row uses');
  assert.equal(row.thumbnail, 'https://a.espncdn.com/media/2026/1108/31053444.jpg', 'the listing’s own thumbnail wins');
  assert.equal(row.page, 'https://www.espn.com/video/clip/_/id/31053444', 'and so does its page');
  // Still no fixture, still no match state, still no anchor: storing a rendition
  // does not turn a league clip into a match clip.
  assert.equal(row.kind, 'league');
  assert.equal(row.event_id, null);
  assert.equal(row.status, null);
  assert.equal(row.anchor_key, null);

  // A listing with no thumbnail or page of its own takes the rendition’s.
  const bare = leagueRow({
    kind: 'league',
    clip: leagueClip({ thumbnail: null, page: 'https://www.espn.com/video/clip/_/id/31053444' }),
    sourceUrl: null,
    media,
  })!;
  assert.equal(bare.thumbnail, media.thumbnail);

  // A rendition that cannot play stores nothing worth keeping, and the row says so.
  const refused = leagueRow({ kind: 'league', clip: leagueClip(), sourceUrl: null, media: { mp4: null, hls: null, page: null, thumbnail: null, duration: null } })!;
  assert.equal(refused.mp4, null);
  assert.equal(refused.playable, false);
  assert.equal(refused.duration, null);
});

test('re-storing a league clip never wipes the rendition already on the row', () => {
  // The trap this guards: a sweep re-reads the league listing every 15 minutes and
  // that listing carries no media URL. A plain assignment would null the mp4 a
  // reader's play had resolved and stored — losing it on every join, forever.
  const batch = insertSql([
    leagueRow({ kind: 'league', clip: leagueClip(), sourceUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news' })!,
  ])!;
  const conflict = batch.sql.slice(batch.sql.indexOf('ON CONFLICT'));
  for (const column of ['mp4', 'hls', 'duration', 'thumbnail', 'page']) {
    assert.ok(
      conflict.includes(`"${column}" = COALESCE(EXCLUDED."${column}", "sports_highlight_clips"."${column}")`),
      `${column} must keep what is stored when the incoming row has none`,
    );
    assert.ok(!conflict.includes(`"${column}" = EXCLUDED."${column}"`), `${column} must not be overwritten with nothing`);
  }
  assert.match(conflict, /"playable" = COALESCE\(EXCLUDED\."mp4", "sports_highlight_clips"\."mp4"\) IS NOT NULL/,
    'derived from the merged media, so it cannot disagree with the columns beside it');
  // The columns a listing is authoritative about are still corrected on re-read.
  assert.match(conflict, /"title" = EXCLUDED\."title"/);
  assert.match(conflict, /"status" = EXCLUDED\."status"/);
  assert.match(conflict, /"seen_at" = now\(\)/);
});

test('the rendition lookups are inert without a database', async () => {
  assert.equal(highlightsStore.available(), false, 'this suite runs with no DATABASE_URL');
  assert.equal(await findStoredNewsMedia('31053444'), null, 'a miss, not a throw');
  assert.equal(await storeNewsMedia('31053444', { mp4: 'https://espnmedia-cdn.akamaized.net/a.mp4', hls: null, page: null, thumbnail: null, duration: 10 }), 0, 'no rows updated');
  assert.deepEqual(await newsClipsNeedingMedia(6), [], 'nothing to pre-warm');
  // The store surface agrees, so an injected store behaves the same way.
  assert.equal(await highlightsStore.findNewsMedia('31053444'), null);
  assert.equal(await highlightsStore.storeNewsMedia('31053444', null), 0);
  assert.deepEqual(await highlightsStore.newsClipsNeedingMedia(6), []);
  // A rendition that cannot play is not written even with a database: nothing
  // worth keeping permanently, and the probe table remembers the refusal.
  assert.equal(await storeNewsMedia('31053444', { mp4: null, hls: null, page: null, thumbnail: null, duration: null }), 0);
  assert.equal(await storeNewsMedia('', { mp4: 'https://espnmedia-cdn.akamaized.net/a.mp4', hls: null, page: null, thumbnail: null, duration: null }), 0);
});

test('one batch is one statement, with every value bound', () => {
  const rows = uniqueRows([
    stored(matchClip()),
    stored(matchClip({ id: '2', title: 'A second clip' })),
    // The same clip twice in one pass: two competitions reporting one video.
    stored(matchClip({ title: 'A different title for the same clip' })),
    { kind: 'league' as const, clip: leagueClip() },
    // Unrenderable, so dropped before SQL rather than stored as an empty card.
    stored(matchClip({ id: '3', mp4: null, hls: null, page: null })),
  ]);
  assert.equal(rows.length, 3, 'a duplicate key and an unrenderable clip are dropped');
  assert.deepEqual(rows.map((row) => row.external_key), ['match:49861382', 'match:2', 'league:espn-video-epl-31053444']);

  const batch = insertSql(rows)!;
  const columns = batch.sql.slice(batch.sql.indexOf('(') + 1, batch.sql.indexOf(')'));
  const fields = columns.split(',').map((column) => column.trim().replace(/"/g, ''));
  assert.equal(fields.length, 25);
  assert.ok(fields.includes('external_key') && fields.includes('kind') && fields.includes('status') && fields.includes('anchor_key'));
  assert.ok(!fields.includes('discovered_at'), 'when this site first saw a clip is never overwritten');
  assert.ok(!fields.includes('seen_at'), 'it is set by the statement itself');

  // Every value is a placeholder: nothing a clip carries is interpolated into SQL.
  assert.equal(batch.params.length, rows.length * fields.length);
  for (const row of rows) {
    assert.ok(!batch.sql.includes(row.title), 'a title never appears in the SQL text');
    assert.ok(!batch.sql.includes(row.external_key));
  }
  assert.ok(batch.params.includes('Saka opens the scoring'), 'it is bound instead');
  assert.match(batch.sql, /ON CONFLICT \("external_key"\) DO UPDATE SET/);
  assert.match(batch.sql, /"seen_at" = now\(\)/);
  assert.match(batch.sql, /"status" = EXCLUDED\."status"/, 'a game that went from live to full time is corrected');
  assert.ok(!/"discovered_at" =/.test(batch.sql));

  assert.equal(insertSql([]), null);
  assert.equal(insertSql(Array.from({ length: 101 }, () => rows[0])), null, 'a batch is bounded, so a pass cannot build an absurd statement');
});

test('a stored row reads back as the same clip', () => {
  const original = matchClip();
  const row = matchRow(stored(original))! as ClipRow;
  // A clip survives the round trip unchanged, so a stored card and a live one for
  // the same clip are the same card: same fixture, same state, same media, and the
  // same anchor, which is what lets a like on one be a like on the other.
  assert.deepEqual(rowToMatchClip(row), original);

  const leagueOriginal = leagueClip();
  const leagueRowValue = leagueRow({ kind: 'league', clip: leagueOriginal })!;
  assert.deepEqual(rowToLeagueClip(leagueRowValue), leagueOriginal);

  // A clip ESPN reported no id for keeps the derived one it was given.
  const keyed = matchRow(stored(matchClip({ id: 'espn-epl-401111111:a late winner' })))!;
  assert.equal(rowToMatchClip(keyed)!.id, 'espn-epl-401111111:a late winner');
  assert.equal(keyed.anchor_key, matchRow(stored(matchClip({ id: 'espn-epl-401111111:a late winner' })))!.anchor_key,
    'the anchor id is derived from the clip id alone, so the same clip engages identically wherever it is read');
  assert.notEqual(keyed.anchor_key, row.anchor_key);
});

test('a row that cannot be rendered is dropped rather than shown broken', () => {
  const row = matchRow(stored(matchClip()))!;
  assert.equal(rowToMatchClip({ ...row, kind: 'league' }), null, 'a league row is not a match clip');
  assert.equal(rowToMatchClip({ ...row, status: null }), null, 'a clip with no state has no card');
  assert.equal(rowToMatchClip({ ...row, status: 'cached' as never }), null, 'and a fourth state is refused');
  assert.equal(rowToMatchClip({ ...row, title: '' }), null);
  assert.equal(rowToMatchClip({ ...row, league: 'not-a-league' }), null);
  assert.equal(rowToMatchClip({ ...row, mp4: null, hls: null, page: null }), null);

  const league = leagueRow({ kind: 'league', clip: leagueClip() })!;
  assert.equal(rowToLeagueClip({ ...league, kind: 'match' }), null);
  assert.equal(rowToLeagueClip({ ...league, page: null }), null);
  assert.equal(rowToLeagueClip({ ...league, teams: 'not json' })!.teams.length, 0, 'a corrupt label list reads as none');
});

test('without a database the store is inert, and says why', async () => {
  // The suite runs with no DATABASE_URL, which is exactly the deployment this
  // must not break: every call resolves, nothing throws, nothing is written.
  assert.equal(highlightsStore.available(), false);

  const read = await highlightsStore.read({ league: 'epl', status: 'final' });
  assert.deepEqual(read, INDEX_EMPTY);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'no-database');
  assert.deepEqual(read.match, []);
  assert.deepEqual(read.league, []);
  assert.equal(read.remaining, 0);
  assert.deepEqual(read.byLeague, []);
  assert.deepEqual(read.byStatus, []);

  assert.deepEqual(await highlightsStore.summary(), INDEX_UNAVAILABLE);
  assert.equal(INDEX_UNAVAILABLE.ok, false);
  assert.equal(INDEX_UNAVAILABLE.clips, 0);

  assert.equal(await highlightsStore.store([stored(matchClip())]), 0, 'a clip is dropped, not queued for a database that is not there');
  assert.deepEqual(await highlightsStore.probeable(['probe:epl:1'], 1000), new Set(['probe:epl:1']));
  await highlightsStore.recordProbes([{ key: 'probe:epl:1', clips: 2 }]);
  await highlightsStore.recordCells([{ key: 'sweep:epl:20261110', games: 1, clips: 2 }]);
  assert.deepEqual(await highlightsStore.freshCells(['sweep:epl:20261110'], 1000), new Set(), 'nothing is remembered, so nothing is skipped');
  assert.equal(await findStoredHighlightClip('49861382'), null, 'engagement on a stored clip resolves to nothing, and does not throw');
});
