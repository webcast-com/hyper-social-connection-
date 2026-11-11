import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPORTS_ANCHOR_KINDS,
  SPORTS_DESK,
  anchorKey,
  anchorRef,
  highlightAnchorDraft,
  highlightAnchorId,
  leaderAnchorDraft,
  leaderAnchorId,
  postKindFor,
} from '../../src/lib/sports-anchor';
import { highlightAnchorRefs, leaderAnchorRefs } from '../../src/lib/sports-anchor-store';
import { normalizeLeaders } from '../../src/lib/espn-leaders';
import type { SportsHighlightClip } from '../../src/lib/espn-highlights';
import type { SportsLeaderRow } from '../../src/lib/espn-leaders';

/**
 * The identity half of sports anchor posts.
 *
 * A card's anchor is the only thing standing between "a member liked a stat
 * card" and a post the whole site can read, so its key has to be stable (the same
 * player leading the same metric keeps one thread across refreshes), bounded (it
 * comes from provider strings and a client request), and shared — the components
 * that render a card and the store that writes it must never disagree about it.
 */

const leaderRow = (over: Partial<SportsLeaderRow> = {}): SportsLeaderRow => ({
  key: '3945274',
  name: 'Luka Dončić',
  value: '33.9',
  metric: 'Points Per Game',
  team: 'Dallas Mavericks',
  teamAbbr: 'DAL',
  position: 'PG',
  headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png',
  ...over,
} as SportsLeaderRow);

const clip = (over: Partial<SportsHighlightClip> = {}): SportsHighlightClip => ({
  id: '49861382',
  title: 'Saka opens the scoring',
  description: 'A curled finish from the edge of the box.',
  duration: 47,
  thumbnail: 'https://a.espncdn.com/media/2026/0907/49861382.jpg',
  mp4: 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4',
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
} as SportsHighlightClip);

test('an anchor ref accepts only a known card kind and a bounded, url-safe id', () => {
  assert.deepEqual(anchorRef('leader', 'basketball:points-per-game:3945274'), {
    kind: 'leader',
    id: 'basketball:points-per-game:3945274',
  });
  assert.deepEqual(anchorRef('highlight', '49861382'), { kind: 'highlight', id: '49861382' });

  // Unknown kinds are refused rather than coerced into a new post type.
  assert.equal(anchorRef('match', 'epl:401111111'), null);
  assert.equal(anchorRef('news', '1'), null);
  assert.equal(anchorRef('', '1'), null);
  assert.equal(anchorRef(undefined, '1'), null);
  assert.equal(anchorRef(7, '1'), null);

  // Ids come from provider strings and from a client, so they are keys only:
  // no markup, no spaces, no path or query, no uppercase, no empties.
  for (const bad of ['', ' ', 'UPPER', 'has space', '../etc/passwd', 'a?b=1', 'a#b', '<img>', 'id/with/slash', '-leading', '.leading']) {
    assert.equal(anchorRef('highlight', bad), null, `refused ${JSON.stringify(bad)}`);
  }
  assert.equal(anchorRef('highlight', { toString: () => '49861382' }), null, 'an object is not an id');
  assert.equal(anchorRef('highlight', 'a'.repeat(161)), null, 'an id longer than the column is refused');
  assert.ok(anchorRef('highlight', 'a'.repeat(160)), 'an id at the limit is accepted');
});

test('the external key and post kind are derived from the ref alone', () => {
  const ref = anchorRef('leader', 'basketball:points-per-game:3945274')!;
  assert.equal(anchorKey(ref), 'sports:leader:basketball:points-per-game:3945274');
  assert.equal(postKindFor(ref), 'sports_leader');
  assert.equal(postKindFor(anchorRef('highlight', '49861382')!), 'sports_highlight');
  // Two cards of different kinds sharing a numeric id stay different posts.
  assert.notEqual(anchorKey(anchorRef('leader', '49861382')!), anchorKey(anchorRef('highlight', '49861382')!));
  assert.deepEqual([...SPORTS_ANCHOR_KINDS], ['leader', 'highlight']);
});

test('a leader keeps one anchor across refreshes, and one per metric and sport', () => {
  const id = leaderAnchorId('basketball', leaderRow());
  assert.equal(id, 'basketball:points-per-game:3945274');
  // A new value for the same player and metric is the same conversation, so the
  // thread accumulates instead of starting over every 15-minute refresh.
  assert.equal(leaderAnchorId('basketball', leaderRow({ value: '34.2' })), id);
  assert.equal(leaderAnchorId('basketball', leaderRow({ team: 'Los Angeles Lakers' })), id);
  // A different metric, a different sport or a different player is not.
  assert.notEqual(leaderAnchorId('basketball', leaderRow({ metric: 'Assists Per Game' })), id);
  assert.notEqual(leaderAnchorId('football', leaderRow()), id);
  assert.notEqual(leaderAnchorId('basketball', leaderRow({ key: '3202' })), id);

  // Punctuation and diacritics in ESPN's own labels cannot leak into a key, and
  // the id the normaliser derives for a row anchors the same card every time.
  const fromPayload = normalizeLeaders({
    categories: [{
      displayName: 'Points Per Game Leaders',
      leaders: [{
        athlete: { id: '3945274', displayName: 'Luka Dončić', team: { displayName: 'Dallas Mavericks', abbreviation: 'DAL' } },
        displayValue: '33.9',
      }],
    }],
  } as never, 'basketball')[0];
  assert.equal(fromPayload.key, 'luka-doncic');
  assert.equal(fromPayload.metric, 'Points Per Game');
  assert.equal(leaderAnchorId('basketball', fromPayload), 'basketball:points-per-game:luka-doncic');
  // ESPN writes the same name both ways depending on the endpoint; the accent is
  // stripped, so both spellings hold one conversation instead of two.
  assert.equal(
    leaderAnchorId('basketball', normalizeLeaders({ categories: [{ displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'Luka Doncic' }, displayValue: '33.9' }] }] } as never, 'basketball')[0]),
    'basketball:points-per-game:luka-doncic',
  );
  // But a different player is a different card, never a merge.
  assert.notEqual(
    leaderAnchorId('basketball', normalizeLeaders({ categories: [{ displayName: 'Points Per Game Leaders', leaders: [{ athlete: { displayName: 'Nikola Jokić' }, displayValue: '26.4' }] }] } as never, 'basketball')[0]),
    'basketball:points-per-game:luka-doncic',
  );
});

test('a leader draft posts the card\u2019s own values, with the headshot as its image', () => {
  const draft = leaderAnchorDraft('basketball', 'nba', leaderRow())!;
  assert.equal(draft.externalKey, 'sports:leader:basketball:points-per-game:3945274');
  assert.equal(draft.postKind, 'sports_leader');
  assert.equal(draft.imageUrl, 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
  assert.equal(draft.videoUrl, null);
  assert.match(draft.content, /Luka Dončić leads the NBA in points per game with 33\.9\./);
  assert.match(draft.content, /Dallas Mavericks · PG/);
  assert.match(draft.content, /#Sports #Leaders #HyperSports/);
  assert.ok(draft.content.length <= 1200);

  // A row with no team still reads as a sentence, without a dangling separator.
  const noTeam = leaderAnchorDraft('football', 'nfl', leaderRow({ team: '—', position: null, metric: 'Passing Yards', value: '3,678' }))!;
  assert.match(noTeam.content, /leads the NFL in passing yards with 3,678\./);
  assert.doesNotMatch(noTeam.content, /—/);

  // Nothing to say means nothing to post.
  assert.equal(leaderAnchorDraft('basketball', 'nba', leaderRow({ value: '' })), null);
  assert.equal(leaderAnchorDraft('basketball', 'nba', leaderRow({ name: '' })), null);
});

test('a highlight draft carries ESPN\u2019s own clip media and fixture context', () => {
  const draft = highlightAnchorDraft(clip())!;
  assert.equal(draft.externalKey, 'sports:highlight:49861382');
  assert.equal(draft.postKind, 'sports_highlight');
  assert.equal(highlightAnchorId(clip()), '49861382');
  assert.equal(draft.imageUrl, 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
  assert.equal(draft.videoUrl, 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4');
  assert.match(draft.content, /🎬 Saka opens the scoring/);
  assert.match(draft.content, /Arsenal vs Chelsea · Premier League/);
  assert.match(draft.content, /A curled finish from the edge of the box\./);
  assert.match(draft.content, /#Sports #Highlights #HyperSports/);
  assert.ok(draft.content.length <= 1200);

  // A clip whose title already is the fixture does not say it twice, and one
  // with no description still posts.
  const terse = highlightAnchorDraft(clip({ eventName: 'Saka opens the scoring', description: '  ' }))!;
  assert.equal(terse.content.split('Saka opens the scoring').length - 1, 1);
  assert.match(terse.content, /Premier League/);
  assert.equal(highlightAnchorDraft(clip({ title: '' })), null);
});

test('only live boards and real clips can anchor a post', () => {
  const boards = {
    basketball: {
      sport: 'basketball' as const,
      league: 'nba',
      status: 'live' as const,
      rows: [leaderRow(), leaderRow({ key: '3202', name: 'Nikola Jokić', metric: 'Rebounds Per Game', value: '12.4' })],
      source: { ok: true, url: 'https://espn.test/leaders', httpStatus: 200 },
    },
    football: {
      sport: 'football' as const,
      league: 'nfl',
      // The bundled sample while ESPN is unreachable: placeholder values must
      // never be stored as though a member had posted them.
      status: 'unavailable' as const,
      rows: [leaderRow({ key: '3916387', name: 'Lamar Jackson', metric: 'Passing Yards', value: '3,678' })],
      source: { ok: false, url: 'https://espn.test/leaders', httpStatus: 403 },
    },
  };
  const refs = leaderAnchorRefs(boards as never);
  assert.deepEqual(refs, [
    { kind: 'leader', id: 'basketball:points-per-game:3945274' },
    { kind: 'leader', id: 'basketball:rebounds-per-game:3202' },
  ]);

  assert.deepEqual(highlightAnchorRefs({ clips: [clip()], status: 'live', games: 1 } as never), [
    { kind: 'highlight', id: '49861382' },
  ]);
  // A partial board still holds real clips, so its cards can be engaged with.
  assert.equal(highlightAnchorRefs({ clips: [clip()], status: 'partial', games: 1 } as never).length, 1);
  assert.deepEqual(highlightAnchorRefs({ clips: [clip()], status: 'unavailable', games: 1 } as never), []);
  // One homepage render is bounded, so a long clip list cannot fan out.
  const many = Array.from({ length: 25 }, (_, index) => clip({ id: `498613${index}` }));
  assert.equal(highlightAnchorRefs({ clips: many, status: 'live', games: 25 } as never, 10).length, 10);
});

test('the sports desk is a broadcaster account that members can follow but never sign in as', () => {
  assert.equal(SPORTS_DESK.name, 'Hyper Sports');
  assert.match(SPORTS_DESK.email, /^sports@/);
  assert.match(SPORTS_DESK.username, /^[a-z0-9_]+$/);
  assert.match(SPORTS_DESK.bio, /sports desk/i);
});
