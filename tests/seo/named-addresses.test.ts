import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLUG_MAX, namedSegment, slugWords, trailingId } from '../../src/lib/seo-slug';
import { eventMatchHref, fixtureName, matchEventId, matchHref } from '../../src/lib/espn-match';
import { clipHref, clipIdCandidates } from '../../src/lib/highlight-clip';

/**
 * Addresses that read: a name in front of the id, never instead of it.
 *
 * The id is what a page is found by, so every rule here is one of two things: how
 * a name becomes words, or proof that the id survives the trip there and back.
 */

test('a name becomes lower-case words joined by dashes', () => {
  assert.equal(slugWords('Arsenal vs Chelsea'), 'arsenal-vs-chelsea');
  assert.equal(slugWords('  Brighton & Hove Albion  '), 'brighton-and-hove-albion');
  assert.equal(slugWords('Atlético Madrid vs Bayern München'), 'atletico-madrid-vs-bayern-munchen', 'accents fold to the letters people type');
  assert.equal(slugWords("Nott'm Forest — St. Mirren (2-1)"), 'nottm-forest-st-mirren-2-1', 'an apostrophe does not split a word; punctuation is one dash');
  assert.equal(slugWords('1. FC Köln vs Schalke 04'), '1-fc-koln-vs-schalke-04', 'digits in a name are kept');
});

test('a name with no words this site can spell gives no words, not noise', () => {
  for (const empty of ['', '   ', '—', '🎬', 'الهلال ضد النصر', null, undefined]) assert.equal(slugWords(empty), '');
});

test('a long name is cut at a word, never mid-word, and never ends in a dash', () => {
  const long = 'Gabe Perreault lights the lamp for the Rangers late in the third period to force overtime in Vancouver';
  const words = slugWords(long);
  assert.ok(words.length <= SLUG_MAX);
  assert.equal(words, 'gabe-perreault-lights-the-lamp-for-the-rangers-late-in-the-third-period-to-force');
  // Two full club names fit, so a fixture's address never names half a side.
  assert.equal(slugWords('North Carolina Central Eagles vs South Carolina State Bulldogs'), 'north-carolina-central-eagles-vs-south-carolina-state-bulldogs');
  assert.ok(slugWords(long).split('-').every((word) => long.toLowerCase().split(' ').includes(word)), 'every word is a whole word of the name');
  assert.equal(slugWords('a'.repeat(200)).length, SLUG_MAX, 'one unbroken word is simply cut');
});

test('the id is always the end of the segment, and reads back unchanged', () => {
  assert.equal(namedSegment('Arsenal vs Chelsea', '740123'), 'arsenal-vs-chelsea-740123');
  assert.equal(namedSegment('', '740123'), '740123');
  assert.equal(namedSegment('🎬', '740123'), '740123');
  assert.equal(namedSegment('Arsenal vs Chelsea', 'espn-epl-740123-top-10'), 'espn-epl-740123-top-10', 'an id that is not a plain number takes no name: it could not be read back');

  // A name that ends in a number, or is nothing but one, must not be read as the id.
  for (const name of ['Arsenal vs Chelsea', 'Schalke 04', '1860', 'Top 10', 'A-B', 'x'.repeat(300), '']) {
    for (const id of ['1', '740123', '401234567', '99999999999999999999']) {
      const read = trailingId(namedSegment(name, id));
      assert.equal(read?.id, id, `${name} / ${id}`);
      assert.equal(read?.named, !!slugWords(name));
    }
  }
  for (const not of ['arsenal-vs-chelsea', '740123-arsenal', '', '-', 'abc123', null, undefined]) assert.equal(trailingId(not), null);
});

test('a match address carries the fixture, and the id alone still names the match', () => {
  const reference = { league: 'epl', eventId: '740123' };
  assert.equal(matchHref(reference), '/sports/matches/epl/740123');
  assert.equal(matchHref(reference, null), '/sports/matches/epl/740123');
  assert.equal(matchHref(reference, 'Arsenal vs Chelsea'), '/sports/matches/epl/arsenal-vs-chelsea-740123');

  assert.equal(matchEventId('740123'), '740123');
  assert.equal(matchEventId('arsenal-vs-chelsea-740123'), '740123');
  assert.equal(matchEventId('anything-at-all-740123'), '740123', 'the words are never what the match is found by');
  for (const bad of ['arsenal-vs-chelsea', 'arsenal-vs-chelsea-0', 'arsenal-vs-chelsea-007', '740123-arsenal', '-740123x', '', '9'.repeat(21)]) {
    assert.equal(matchEventId(bad), null, bad);
  }
});

test('a board names a fixture the way the stored clips do: home, then away', () => {
  assert.equal(fixtureName('Arsenal', 'Chelsea'), 'Arsenal vs Chelsea');
  assert.equal(fixtureName(' Arsenal ', 'Chelsea'), 'Arsenal vs Chelsea');
  assert.equal(fixtureName('Arsenal', ''), null, 'half a fixture is not a name');
  assert.equal(fixtureName(null, undefined), null);

  const event = { details: { league: 'epl', eventId: '740123' }, home: { name: 'Arsenal' }, away: { name: 'Chelsea' } };
  assert.equal(eventMatchHref(event), '/sports/matches/epl/arsenal-vs-chelsea-740123');
  assert.equal(eventMatchHref({ ...event, home: { name: '' } }), '/sports/matches/epl/740123');
  assert.equal(eventMatchHref({ ...event, details: undefined }), '/sports', 'no match page: the board, not a broken address');
});

test('a clip address carries the title, and reads back to the stored id', () => {
  assert.equal(clipHref({ id: '50476535', title: 'Saka opens the scoring' }), '/sports/highlights/saka-opens-the-scoring-50476535');
  assert.equal(clipHref({ id: '50476535' }), '/sports/highlights/50476535');
  assert.equal(clipHref({ id: '50476535', title: '🎬' }), '/sports/highlights/50476535');
  // A sample card's id is not a number, so its address is what it always was.
  assert.equal(clipHref({ id: 'sample-epl-1x', title: 'Premier League highlights' }), '/sports/highlights/sample-epl-1x');

  assert.deepEqual(clipIdCandidates('50476535'), ['50476535']);
  assert.deepEqual(clipIdCandidates('saka-opens-the-scoring-50476535'), ['50476535', 'saka-opens-the-scoring-50476535'],
    'the id after the last dash first; the whole segment after it, for a stored id with dashes of its own');
  assert.deepEqual(clipIdCandidates('some-old-id'), ['some-old-id']);
  assert.deepEqual(clipIdCandidates('  '), []);
});
