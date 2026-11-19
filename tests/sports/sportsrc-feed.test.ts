import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getStreamBoard, getStreamDetail, resetSportsrcCache, sportsrcConfigured } from '../../src/lib/sportsrc-feed';
import { ARSENAL_ID, NOW, detailPayload, matchesPayload, sportsPayload } from './sportsrc-fixture';

/**
 * The SportSRC requests: where the key goes, how few requests are made against
 * a daily allowance every visitor shares, and what a failure turns into.
 */

type Call = { url: URL; key: string | null };
type Reply = { status?: number; body?: unknown; remaining?: number };

function provider(replies: Partial<Record<'matches' | 'detail' | 'sports', Reply | (() => Reply)>> = {}) {
  const calls: Call[] = [];
  let clock = NOW;
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, key: new Headers(init?.headers).get('x-api-key') });
    const type = url.searchParams.get('type') as 'matches' | 'detail' | 'sports';
    const given = replies[type];
    const reply = (typeof given === 'function' ? given() : given) ?? {};
    const body = reply.body ?? (type === 'matches' ? matchesPayload() : type === 'detail' ? detailPayload(url.searchParams.get('id') ?? undefined) : sportsPayload());
    return new Response(JSON.stringify(body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...(reply.remaining === undefined ? {} : { 'X-RateLimit-Remaining': String(reply.remaining) }) },
    });
  }) as unknown as typeof fetch;
  return {
    calls,
    of: (type: string) => calls.filter((call) => call.url.searchParams.get('type') === type),
    options: { fetchImpl, now: () => clock, apiKey: 'secret-key' },
    advance: (ms: number) => { clock += ms; },
  };
}

beforeEach(() => resetSportsrcCache());

test('without a key nothing is asked, and the board says why it is empty', async () => {
  const sportsrc = provider();
  const board = await getStreamBoard({}, { ...sportsrc.options, apiKey: '' });
  assert.equal(board.state, 'missing-key');
  assert.deepEqual(board.matches, []);
  assert.deepEqual(board.sports.map((sport) => sport.id), ['football']);
  assert.equal((await getStreamDetail(ARSENAL_ID, { ...sportsrc.options, apiKey: '' })).state, 'missing-key');
  assert.equal(sportsrc.calls.length, 0);
});

test('the key travels in the X-API-KEY header and never in the address', async () => {
  const sportsrc = provider();
  const board = await getStreamBoard({}, sportsrc.options);
  assert.equal(board.state, 'ok');
  assert.equal(board.matches.length, 6);
  const [matches] = sportsrc.of('matches');
  assert.equal(matches.key, 'secret-key');
  assert.equal(matches.url.origin + matches.url.pathname, 'https://api.sportsrc.org/v3/');
  assert.ok(sportsrc.calls.every((call) => !call.url.href.includes('secret-key')));
  // The sports list needs no key, so it is not given one.
  assert.equal(sportsrc.of('sports')[0].key, null);
  // Nothing in what goes to the browser carries it either.
  assert.ok(!JSON.stringify(board).includes('secret-key'));
});

test('one request serves every tab: no status filter, and no date unless a day was picked', async () => {
  const sportsrc = provider();
  await getStreamBoard({ sport: 'football' }, sportsrc.options);
  const [first] = sportsrc.of('matches');
  assert.equal(first.url.searchParams.get('sport'), 'football');
  assert.equal(first.url.searchParams.has('status'), false);
  assert.equal(first.url.searchParams.has('date'), false);

  const dated = await getStreamBoard({ date: '2026-11-25' }, sportsrc.options);
  assert.equal(dated.date, '2026-11-25');
  assert.equal(sportsrc.of('matches')[1].url.searchParams.get('date'), '2026-11-25');

  // A malformed sport or day is dropped, not passed on.
  const odd = await getStreamBoard({ sport: 'foot ball&type=odds', date: '25/11/2026' }, sportsrc.options);
  assert.equal(odd.sport, 'football');
  assert.equal(odd.date, '');
  assert.equal(sportsrc.of('matches').length, 2, 'that is the first request again, answered from memory');
});

test('an answer is kept: two minutes for the current list, ten for a picked day', async () => {
  const sportsrc = provider();
  await getStreamBoard({}, sportsrc.options);
  await getStreamBoard({}, sportsrc.options);
  sportsrc.advance(119_000);
  await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 1);
  sportsrc.advance(2_000);
  await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 2);
  assert.equal(sportsrc.of('sports').length, 1, 'the sports list is kept for an hour');

  await getStreamBoard({ date: '2026-11-25' }, sportsrc.options);
  sportsrc.advance(9 * 60_000);
  await getStreamBoard({ date: '2026-11-25' }, sportsrc.options);
  assert.equal(sportsrc.of('matches').filter((call) => call.url.searchParams.has('date')).length, 1);
});

test('readers arriving together share one request', async () => {
  const sportsrc = provider();
  const boards = await Promise.all([getStreamBoard({}, sportsrc.options), getStreamBoard({}, sportsrc.options), getStreamBoard({}, sportsrc.options)]);
  assert.equal(sportsrc.of('matches').length, 1);
  assert.ok(boards.every((board) => board.matches.length === 6));
});

test('a refused key and a used-up allowance are told apart', async () => {
  let sportsrc = provider({ matches: { status: 401, body: { success: false } } });
  assert.equal((await getStreamBoard({}, sportsrc.options)).state, 'unauthorized');

  resetSportsrcCache();
  sportsrc = provider({ matches: { status: 429, body: { success: false } } });
  assert.equal((await getStreamBoard({}, sportsrc.options)).state, 'rate-limited');
  // Nothing more is asked that day, however long the page stays open.
  sportsrc.advance(60 * 60_000);
  assert.equal((await getStreamBoard({}, sportsrc.options)).state, 'rate-limited');
  assert.equal((await getStreamDetail(ARSENAL_ID, sportsrc.options)).state, 'rate-limited');
  assert.equal(sportsrc.of('matches').length, 1);
  assert.equal(sportsrc.of('detail').length, 0);
});

test('when SportSRC reports the allowance at zero, asking stops until the day turns over', async () => {
  const sportsrc = provider({ matches: { remaining: 0 } });
  assert.equal((await getStreamBoard({}, sportsrc.options)).state, 'ok');
  sportsrc.advance(10 * 60_000);
  const later = await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 1);
  // The list already held is still shown, marked as not fresh.
  assert.equal(later.matches.length, 6);
  assert.equal(later.stale, true);
  // 00:00 UTC: a new day, a new allowance.
  sportsrc.advance(6 * 60 * 60_000);
  await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 2);
});

test('with the allowance running low, answers are kept four times as long', async () => {
  const sportsrc = provider({ matches: { remaining: 40 } });
  await getStreamBoard({}, sportsrc.options);
  sportsrc.advance(7 * 60_000);
  await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 1);
  sportsrc.advance(2 * 60_000);
  await getStreamBoard({}, sportsrc.options);
  assert.equal(sportsrc.of('matches').length, 2);
});

test('a failed refresh shows the last list, marked stale, and tries again soon', async () => {
  let down = false;
  const sportsrc = provider({ matches: () => (down ? { status: 503, body: {} } : {}) });
  await getStreamBoard({}, sportsrc.options);
  down = true;
  sportsrc.advance(121_000);
  const stale = await getStreamBoard({}, sportsrc.options);
  assert.equal(stale.state, 'ok');
  assert.equal(stale.stale, true);
  assert.equal(stale.matches.length, 6);
  down = false;
  sportsrc.advance(31_000);
  const fresh = await getStreamBoard({}, sportsrc.options);
  assert.equal(fresh.stale, undefined);
  assert.equal(sportsrc.of('matches').length, 3);
});

test('with nothing held, a failure is an empty board that says so', async () => {
  const sportsrc = provider({ matches: { status: 500, body: {} } });
  const board = await getStreamBoard({}, sportsrc.options);
  assert.equal(board.state, 'unavailable');
  assert.deepEqual(board.matches, []);
  const refused = provider({ matches: { body: { success: false, error: 'nope' } } });
  resetSportsrcCache();
  assert.equal((await getStreamBoard({}, refused.options)).state, 'unavailable');
});

test('a match’s sources are asked once per five minutes, and only for an id SportSRC could have issued', async () => {
  const sportsrc = provider();
  const result = await getStreamDetail(ARSENAL_ID, sportsrc.options);
  assert.equal(result.state, 'ok');
  assert.deepEqual(result.detail?.sources.map((source) => source.label), ['LOLA', 'HDTV']);
  const [call] = sportsrc.of('detail');
  assert.equal(call.url.searchParams.get('id'), ARSENAL_ID);
  assert.equal(call.key, 'secret-key');
  await getStreamDetail(ARSENAL_ID, sportsrc.options);
  sportsrc.advance(4 * 60_000);
  await getStreamDetail(ARSENAL_ID, sportsrc.options);
  assert.equal(sportsrc.of('detail').length, 1);

  for (const bad of ['', 'a b', '../../etc/passwd', `${ARSENAL_ID}&type=odds`, null]) {
    assert.equal((await getStreamDetail(bad, sportsrc.options)).state, 'unavailable');
  }
  assert.equal(sportsrc.of('detail').length, 1);
});

test('the health report can say whether a key is set without saying what it is', () => {
  const before = process.env.SPORTSRC_API_KEY;
  try {
    delete process.env.SPORTSRC_API_KEY;
    delete process.env.SPORTSRC_KEY;
    assert.equal(sportsrcConfigured(), false);
    process.env.SPORTSRC_API_KEY = '  abc  ';
    assert.equal(sportsrcConfigured(), true);
  } finally {
    if (before === undefined) delete process.env.SPORTSRC_API_KEY; else process.env.SPORTSRC_API_KEY = before;
  }
});
