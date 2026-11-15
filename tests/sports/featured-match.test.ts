import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import {
  MATCHDAY_PAGE_SIZE, footballMinute, isFeaturable, kickoffCountdown, matchdayPage, matchdayStatus, matchProgressPercent,
  pickFeaturedEvent, scoreKey, winningSide,
} from '../../src/lib/featured-match';
import type { SportsEvent } from '../../src/lib/sports';

/**
 * The sports board's featured match and the facts its cards derive.
 *
 * The featured card is a second view of one fixture the board already lists, so
 * the rule that matters is what it is allowed to claim: only a fixture ESPN
 * reports as live, never a sample, never a race, and never a score the provider
 * did not report.
 */

const event = (over: Partial<SportsEvent> = {}): SportsEvent => ({
  id: 'epl-1', source: 'espn', sourceId: '401234567', details: { league: 'epl', eventId: '401234567' },
  sport: 'football', league: 'epl', leagueName: 'Premier League', status: 'live', startAt: '2026-11-09T18:00:00Z',
  venue: 'Emirates Stadium', detail: "54'",
  home: { name: 'Arsenal', short: 'ARS', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', score: 2 },
  away: { name: 'Chelsea', short: 'CHE', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/338.png', score: 1 },
  ...over,
});
const side = (name: string, score: number | null) => ({ name, score });

test('only a live fixture reported by ESPN with two sides can be featured', () => {
  assert.equal(isFeaturable(event()), true);
  assert.equal(isFeaturable(event({ source: 'demo' })), false);
  assert.equal(isFeaturable(event({ status: 'upcoming' })), false);
  assert.equal(isFeaturable(event({ status: 'final' })), false);
  assert.equal(isFeaturable(event({ sport: 'motorsport' })), false);
  assert.equal(isFeaturable(event({ race: { title: 'Review Grand Prix', entries: [] } })), false);
});

test('nothing is featured when nothing featurable is live', () => {
  assert.equal(pickFeaturedEvent([]), null);
  assert.equal(pickFeaturedEvent([event({ status: 'upcoming' }), event({ status: 'final' })]), null);
  // A sample fixture is not a current score, however it is labelled.
  assert.equal(pickFeaturedEvent([event({ source: 'demo' })]), null);
});

test('the most watchable live match leads: most scoring, then furthest into its clock, then board order', () => {
  const quiet = event({ id: 'quiet', home: side('A', 0), away: side('B', 0), detail: "80'" });
  const busy = event({ id: 'busy', home: side('C', 3), away: side('D', 2), detail: "20'" });
  assert.equal(pickFeaturedEvent([quiet, busy])?.id, 'busy');

  const early = event({ id: 'early', detail: "12'" });
  const late = event({ id: 'late', detail: "77'" });
  assert.equal(pickFeaturedEvent([early, late])?.id, 'late');

  const first = event({ id: 'first' });
  const second = event({ id: 'second' });
  assert.equal(pickFeaturedEvent([first, second])?.id, 'first');
});

test('sports are not ranked against each other: the board’s first live sport decides', () => {
  const football = event({ id: 'football', home: side('A', 1), away: side('B', 0) });
  const baseball = event({ id: 'baseball', sport: 'baseball', league: 'mlb', detail: 'Top 7th', home: side('C', 9), away: side('D', 11) });
  assert.equal(pickFeaturedEvent([football, baseball])?.id, 'football');
  assert.equal(pickFeaturedEvent([baseball, football])?.id, 'baseball');
  // An earlier fixture that is not live does not decide the sport.
  assert.equal(pickFeaturedEvent([{ ...baseball, status: 'final' }, football])?.id, 'football');
});

test('an unreported score counts as nothing when ranking and never as a zero on the card', () => {
  const unknown = event({ id: 'unknown', home: side('A', null), away: side('B', null) });
  const known = event({ id: 'known', home: side('C', 1), away: side('D', 0) });
  assert.equal(pickFeaturedEvent([unknown, known])?.id, 'known');
  assert.equal(scoreKey(unknown), '–––');
  assert.equal(scoreKey(event()), '1–2');
  assert.equal(scoreKey(event({ status: 'upcoming' })), '');
});

test('progress is read only from a football minute the provider reported', () => {
  assert.equal(footballMinute(event({ detail: "54'" })), 54);
  assert.equal(footballMinute(event({ detail: "45'+2'" })), 45);
  assert.equal(footballMinute(event({ detail: 'HT' })), 45);
  assert.equal(footballMinute(event({ detail: 'Halftime' })), 45);
  assert.equal(footballMinute(event({ detail: null })), null);
  assert.equal(footballMinute(event({ detail: 'Delayed' })), null);
  // Another sport's clock is not a football minute.
  assert.equal(footballMinute(event({ sport: 'baseball', detail: 'Top 7th' })), null);
  assert.equal(footballMinute(event({ sport: 'rugby', detail: "54'" })), null);
  assert.equal(footballMinute(event({ status: 'final', detail: "90'" })), null);

  assert.equal(matchProgressPercent(event({ detail: "45'" })), 50);
  assert.equal(matchProgressPercent(event({ detail: "9'" })), 10);
  // Extra time does not run the bar past its end.
  assert.equal(matchProgressPercent(event({ detail: "118'" })), 100);
  assert.equal(matchProgressPercent(event({ sport: 'baseball', detail: 'Top 7th' })), null);
});

test('a winner is named only for a finished match with two reported, different scores', () => {
  assert.equal(winningSide(event({ status: 'final' })), 'home');
  assert.equal(winningSide(event({ status: 'final', home: side('A', 0), away: side('B', 3) })), 'away');
  assert.equal(winningSide(event({ status: 'final', home: side('A', 1), away: side('B', 1) })), null);
  assert.equal(winningSide(event({ status: 'final', home: side('A', null), away: side('B', 1) })), null);
  assert.equal(winningSide(event({ status: 'live' })), null);
  assert.equal(winningSide(event({ status: 'upcoming' })), null);
});

test('a kickoff inside the next day gets a countdown; anything else does not', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const at = (iso: string, status: SportsEvent['status'] = 'upcoming') => kickoffCountdown({ status, startAt: iso }, now);
  assert.equal(at('2026-11-09T14:15:00Z'), 'in 2h 15m');
  assert.equal(at('2026-11-09T14:00:00Z'), 'in 2h');
  assert.equal(at('2026-11-09T12:45:00Z'), 'in 45m');
  assert.equal(at('2026-11-09T12:00:20Z'), 'in 1m');
  assert.equal(at('2026-11-10T12:00:00Z'), 'in 24h');
  assert.equal(at('2026-11-10T12:01:00Z'), null);
  assert.equal(at('2026-11-09T12:00:00Z'), null);
  assert.equal(at('2026-11-09T11:00:00Z'), null);
  assert.equal(at('not a date'), null);
  assert.equal(at('2026-11-09T14:15:00Z', 'live'), null);
  assert.equal(at('2026-11-09T14:15:00Z', 'final'), null);
});

test('matchday pages hold six fixtures and a page past the end lands on the last one', () => {
  assert.equal(MATCHDAY_PAGE_SIZE, 6);
  const fixtures = Array.from({ length: 14 }, (_, index) => index);
  assert.deepEqual(matchdayPage(fixtures, 0), { pageCount: 3, current: 0, rows: [0, 1, 2, 3, 4, 5] });
  assert.deepEqual(matchdayPage(fixtures, 2), { pageCount: 3, current: 2, rows: [12, 13] });
  // The view shrank under the reader: never an empty page while fixtures remain.
  assert.deepEqual(matchdayPage(fixtures, 9), { pageCount: 3, current: 2, rows: [12, 13] });
  assert.deepEqual(matchdayPage(fixtures, -1).current, 0);
  assert.deepEqual(matchdayPage(fixtures, Number.NaN).current, 0);
  assert.deepEqual(matchdayPage([], 0), { pageCount: 1, current: 0, rows: [] });
  assert.equal(matchdayPage(fixtures.slice(0, 6), 0).pageCount, 1);
});

test('the matchday status pill carries the provider’s clock and never calls a sample live', () => {
  assert.equal(matchdayStatus(event()), "Live · 54'");
  assert.equal(matchdayStatus(event({ detail: null })), 'Live');
  assert.equal(matchdayStatus(event({ status: 'upcoming', detail: null })), 'Upcoming');
  assert.equal(matchdayStatus(event({ status: 'final', detail: 'Final/OT' })), 'Final/OT');
  assert.equal(matchdayStatus(event({ status: 'final', detail: null })), 'Finished');
  for (const status of ['live', 'upcoming', 'final'] as const) {
    assert.equal(matchdayStatus(event({ source: 'demo', status })), 'Sample fixture');
  }
});

/** Mounts a component in the suite's jsdom window. */
async function mount(component: 'featured' | 'card', props: Record<string, unknown>) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const Component = (await import(component === 'featured' ? '../../src/components/SportsFeaturedMatch' : '../../src/components/SportsEventCard')).default;
  const { createRoot } = await import('react-dom/client');
  const mounted = await mountBoard({ basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } }, football: { sport: 'football', league: 'epl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } } });
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Component as never, props as never)); });
  return {
    container: container as any,
    unmount: async () => {
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

test('the featured card is one link to the match, reads away–home like the board, and is not an article', async () => {
  const mounted = await mount('featured', { event: event(), returnTo: '/sports?league=epl' });
  try {
    const section = mounted.container.querySelector('section[aria-label="Featured match"]');
    assert.ok(section);
    // A second view of a fixture the board lists, so it must not count as one.
    assert.equal(mounted.container.querySelectorAll('article').length, 0);
    assert.equal(mounted.container.querySelectorAll('h1, h2, h3').length, 0);
    const links = [...section.querySelectorAll('a')];
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute('href'), `/sports/matches/epl/401234567?returnTo=${encodeURIComponent('/sports?league=epl')}`);
    assert.equal(links[0].getAttribute('aria-label'), "Featured live match: Chelsea 1, Arsenal 2, Premier League, 54'. Open match details");
    assert.equal(section.querySelector('[data-featured-score]').textContent, '1–2');
    assert.match(section.textContent, /Live · 54'/);
    assert.match(section.textContent, /Emirates Stadium/);
    assert.equal(section.querySelector('[data-featured-progress] span').style.width, '60%');
    assert.deepEqual([...section.querySelectorAll('img')].map((img: any) => img.getAttribute('src')), [
      'https://a.espncdn.com/i/teamlogos/soccer/500/338.png', 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
    ]);
  } finally {
    await mounted.unmount();
  }
});

test('the featured card shows an unreported score as a dash and draws no bar without a football minute', async () => {
  const mounted = await mount('featured', {
    event: event({ sport: 'baseball', league: 'mlb', leagueName: 'Major League Baseball', detail: 'Top 7th', details: undefined, home: side('New York Yankees', null), away: side('Boston Red Sox', 11) }),
  });
  try {
    const section = mounted.container.querySelector('section[aria-label="Featured match"]');
    assert.equal(section.querySelector('[data-featured-score]').textContent, '11––');
    assert.equal(section.querySelector('[data-featured-progress]'), null);
    // No ESPN id means no match page, so the card is text and not a dead link.
    assert.equal(section.querySelectorAll('a').length, 0);
    assert.match(section.querySelector('[role="group"]').getAttribute('aria-label'), /Boston Red Sox 11, New York Yankees not reported/);
    // No logo reported: the side's code stands in.
    assert.equal(section.querySelectorAll('img').length, 0);
    assert.match(section.textContent, /BOS/);
  } finally {
    await mounted.unmount();
  }
});

test('a board card dims the loser of a finished match and nobody in a draw', async () => {
  const names = (container: any) => Object.fromEntries([...container.querySelectorAll('span[title]')].map((node: any) => [node.textContent, node.className]));
  const won = await mount('card', { event: event({ status: 'final', detail: 'FT' }) });
  try {
    const classes = names(won.container);
    assert.match(classes.Chelsea, /text-gray-500/);
    assert.doesNotMatch(classes.Arsenal, /text-gray-500/);
  } finally {
    await won.unmount();
  }
  const drawn = await mount('card', { event: event({ status: 'final', detail: 'FT', home: side('Arsenal', 1), away: side('Chelsea', 1) }) });
  try {
    const classes = names(drawn.container);
    assert.doesNotMatch(classes.Chelsea, /text-gray-500/);
    assert.doesNotMatch(classes.Arsenal, /text-gray-500/);
  } finally {
    await drawn.unmount();
  }
});

test('a board card counts down to a kickoff only when the board gives it a clock', async () => {
  const upcoming = event({ status: 'upcoming', detail: null, startAt: '2026-11-09T14:15:00Z', home: side('Arsenal', null), away: side('Chelsea', null) });
  const withClock = await mount('card', { event: upcoming, now: Date.parse('2026-11-09T12:00:00Z') });
  try {
    assert.equal(withClock.container.querySelector('[data-kickoff-countdown]').textContent, ' · in 2h 15m');
  } finally {
    await withClock.unmount();
  }
  const without = await mount('card', { event: upcoming });
  try {
    assert.equal(without.container.querySelector('[data-kickoff-countdown]'), null);
  } finally {
    await without.unmount();
  }
});

test('a logo that fails to load is replaced by the side’s code', async () => {
  const mounted = await mount('card', { event: event() });
  try {
    const React = await import('react');
    const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
    const article = mounted.container.querySelector('article');
    assert.equal(article.querySelectorAll('img').length, 2);
    const view = article.ownerDocument.defaultView;
    await act(async () => { article.querySelector('img').dispatchEvent(new view.Event('error')); });
    assert.equal(article.querySelectorAll('img').length, 1);
    assert.match(article.textContent, /CHE/);
  } finally {
    await mounted.unmount();
  }
});
