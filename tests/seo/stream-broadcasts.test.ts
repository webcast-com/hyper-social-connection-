import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStreamBoard, parseStreamMatches, parseStreamSports, type StreamBoard } from '../../src/lib/sportsrc';
import { STREAM_BROADCAST_LIMIT, streamBroadcastsStructuredData } from '../../src/lib/stream-seo';
import { ARSENAL_ID, BARCA_ID, DONE_ID, LATER_ID, OFF_ID, SOON_ID, matchesPayload, sportsPayload } from '../sports/sportsrc-fixture';

/**
 * The live-stream screen's structured data: which fixtures are described as
 * broadcasts, and that nothing is claimed that the page does not show.
 */
const SITE = 'https://hyper.co.ke';
const board = (): StreamBoard => ({ state: 'ok', sport: 'football', date: '', fetchedAt: '', sports: parseStreamSports(sportsPayload()), ...parseStreamMatches(matchesPayload()) });
type Item = { '@type': string; name: string; description: string; isLiveBroadcast: boolean; startDate?: string; url: string; broadcastOfEvent: Record<string, any> };
const items = (data: Record<string, any> | null): Item[] => (data?.itemListElement ?? []).map((entry: { item: Item }) => entry.item);

test('the fixtures being streamed or still to come are listed as broadcasts, live first', () => {
  const data = streamBroadcastsStructuredData(board(), SITE)!;
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'ItemList');
  assert.equal(data.name, 'Live football streams');
  assert.equal(data.url, 'https://hyper.co.ke/sports/live');
  // In play first (by kick-off), then upcoming. The finished match and the
  // postponed one are not broadcasts anyone can open.
  assert.deepEqual(items(data).map((item) => item.url.split('match=')[1]), [ARSENAL_ID, BARCA_ID, SOON_ID, LATER_ID]);
  assert.equal(data.numberOfItems, 4);
  assert.deepEqual((data.itemListElement as { position: number }[]).map((entry) => entry.position), [1, 2, 3, 4]);
  const all = JSON.stringify(data);
  assert.ok(!all.includes(DONE_ID) && !all.includes(OFF_ID));
});

test('each one is a BroadcastEvent of a SportsEvent, with what the page shows and nothing else', () => {
  const [arsenal] = items(streamBroadcastsStructuredData(board(), SITE));
  assert.deepEqual(arsenal, {
    '@type': 'BroadcastEvent',
    name: 'Arsenal vs Chelsea live stream',
    description: 'Live stream of Arsenal vs Chelsea (Premier League, England).',
    isLiveBroadcast: true,
    startDate: '2026-11-19T16:50:00.000Z',
    url: `https://hyper.co.ke/sports/live?match=${ARSENAL_ID}`,
    broadcastOfEvent: {
      '@type': 'SportsEvent',
      name: 'Arsenal vs Chelsea',
      sport: 'Football',
      startDate: '2026-11-19T16:50:00.000Z',
      homeTeam: { '@type': 'SportsTeam', name: 'Arsenal', logo: 'https://cdn.sportsrc.org/badges/ars.png' },
      awayTeam: { '@type': 'SportsTeam', name: 'Chelsea', logo: 'https://cdn.sportsrc.org/badges/che.png' },
    },
  });
});

test('nobody is named as the broadcaster, and no video address is claimed', () => {
  const all = JSON.stringify(streamBroadcastsStructuredData(board(), SITE));
  for (const claim of ['publisher', 'provider', 'broadcaster', 'publishedOn', 'VideoObject', 'embedUrl', 'contentUrl', 'thumbnailUrl']) {
    assert.ok(!all.includes(claim), `${claim} is not asserted`);
  }
});

test('a crest that is not https is left out, and a kick-off that was not reported is not guessed', () => {
  // The fixture's Barcelona has a `javascript:` badge, which the parser drops.
  const barca = items(streamBroadcastsStructuredData(board(), SITE)).find((item) => item.url.endsWith(BARCA_ID))!;
  assert.deepEqual(barca.broadcastOfEvent.homeTeam, { '@type': 'SportsTeam', name: 'Barcelona' });

  const undated = board();
  undated.matches = undated.matches.map((match) => (match.id === ARSENAL_ID ? { ...match, startAt: null } : match));
  const arsenal = items(streamBroadcastsStructuredData(undated, SITE)).find((item) => item.url.endsWith(ARSENAL_ID))!;
  assert.equal('startDate' in arsenal, false);
  assert.equal('startDate' in arsenal.broadcastOfEvent, false);
});

test('with nothing live or to come, or no answer from the provider, nothing is emitted', () => {
  assert.equal(streamBroadcastsStructuredData(emptyStreamBoard('missing-key'), SITE), null);
  assert.equal(streamBroadcastsStructuredData(emptyStreamBoard('unavailable'), SITE), null);
  const over = board();
  over.matches = over.matches.filter((match) => match.status === 'finished' || match.status === 'other');
  assert.equal(streamBroadcastsStructuredData(over, SITE), null);
  // A fixture listed without a stream is not a broadcast.
  const dark = board();
  dark.matches = dark.matches.map((match) => ({ ...match, hasStream: false }));
  assert.equal(streamBroadcastsStructuredData(dark, SITE), null);
});

test('the list is bounded, and a trailing slash on the site address does not double up', () => {
  const many = board();
  const [live] = many.matches;
  many.matches = Array.from({ length: 80 }, (_, index) => ({ ...live, id: `match-${index}-Zjox` }));
  assert.equal(items(streamBroadcastsStructuredData(many, SITE)).length, STREAM_BROADCAST_LIMIT);
  assert.equal(items(streamBroadcastsStructuredData(many, SITE, 3)).length, 3);
  assert.equal(streamBroadcastsStructuredData(board(), 'https://hyper.co.ke/')!.url, 'https://hyper.co.ke/sports/live');
});

test('a name from the provider cannot close the script tag it is written into', () => {
  const hostile = board();
  hostile.matches = hostile.matches.map((match) => (match.id === ARSENAL_ID ? { ...match, title: '</script><script>alert(1)</script>' } : match));
  // The page writes the data the way every page here does: JSON with `<` escaped.
  const written = JSON.stringify(streamBroadcastsStructuredData(hostile, SITE)).replace(/</g, '\\u003c');
  assert.ok(!written.includes('</script>'));
  assert.equal(JSON.parse(written).itemListElement[0].item.broadcastOfEvent.name, '</script><script>alert(1)</script>');
});
