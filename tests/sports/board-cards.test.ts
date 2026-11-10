import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import type { SportsEvent } from '../../src/lib/sports';

/**
 * The sports board renders every sport in the same match card.
 *
 * Basketball used to be kept off the board, so nothing proved the card could
 * carry a basketball fixture. It does: same article, same team rows, same
 * score, same match-details link — only the competition, the clock and the
 * scores differ.
 */

const event = (over: Partial<SportsEvent> & Pick<SportsEvent, 'sport' | 'league'>): SportsEvent => ({
  id: `${over.league}-401234567`,
  source: 'espn',
  sourceId: '401234567',
  details: { league: over.league, eventId: '401234567' },
  leagueName: over.league === 'nba' ? 'NBA' : 'Premier League',
  status: 'live',
  startAt: '2026-11-09T18:00:00Z',
  venue: 'Crypto.com Arena',
  detail: 'Q3 4:52',
  home: { name: 'Los Angeles Lakers', short: 'LAL', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png', score: 78 },
  away: { name: 'Boston Celtics', short: 'BOS', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png', score: 74 },
  ...over,
});

const basketball = event({ sport: 'basketball', league: 'nba' });
const football = event({
  sport: 'football', league: 'epl', detail: "54'", venue: 'Emirates Stadium',
  home: { name: 'Arsenal', short: 'ARS', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', score: 2 },
  away: { name: 'Chelsea', short: 'CHE', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/338.png', score: 1 },
});

async function mountCard(fixture: SportsEvent) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  const SportsEventCard = (await import('../../src/components/SportsEventCard')).default;
  const { createRoot } = await import('react-dom/client');
  const mounted = await mountBoard({ basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } }, football: { sport: 'football', league: 'nfl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } } });
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SportsEventCard as never, { event: fixture } as never)); });
  return {
    ...mounted,
    article: container.querySelector('article')!,
    unmount: async () => {
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

test('a basketball fixture is rendered by the board’s own match card', async () => {
  const mount = await mountCard(basketball);
  try {
    const card = mount.article;
    // The same card football uses, unchanged.
    assert.match(card.className, /min-w-0 h-full bg-white dark:bg-gray-800 rounded-2xl border/);
    assert.match(card.textContent, /NBA/);
    assert.match(card.textContent, /LIVE · Q3 4:52/);
    assert.match(card.textContent, /Los Angeles Lakers/);
    assert.match(card.textContent, /Boston Celtics/);
    assert.match(card.textContent, /Crypto.com Arena/);
    // Away–home, the way the card reads every other sport.
    assert.match(card.textContent, /74–78/);
    // Both crests, from ESPN's own basketball logo path.
    const logos = [...card.querySelectorAll('img')].map((img: any) => img.getAttribute('src'));
    assert.deepEqual(logos, ['https://a.espncdn.com/i/teamlogos/nba/500/bos.png', 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png']);
    // The card opens the basketball match, not a football-shaped page.
    const details = [...card.querySelectorAll('a')].find((node: any) => node.textContent.includes('View match details'))!;
    assert.equal(details.getAttribute('href'), '/sports/matches/nba/401234567');
  } finally {
    await mount.unmount();
  }
});

test('the card is identical for both sports apart from the fixture', async () => {
  const basketballCard = await mountCard(basketball);
  const footballCard = await mountCard(football);
  try {
    assert.equal(basketballCard.article.className, footballCard.article.className);
    assert.equal(basketballCard.article.querySelectorAll('button').length, footballCard.article.querySelectorAll('button').length);
    // No football-only wording leaks into a basketball card.
    assert.ok(!basketballCard.article.textContent.includes('FT'));
    assert.match(footballCard.article.textContent, /54'/);
  } finally {
    await basketballCard.unmount();
    await footballCard.unmount();
  }
});
