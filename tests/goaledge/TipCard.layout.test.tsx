/**
 * Layout guard for the tip cards on `/sure-bets`.
 *
 * Two things broke there, both invisible to a type checker and both easy to
 * reintroduce by "tidying" a class list:
 *
 *   1. **Cards did not fill their grid cell.** The section lays the cards out
 *      in `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. Grid items stretch to the
 *      tallest card in the row, but the card itself was `height: auto`, so a
 *      card with less content stopped short and left a ragged gap under it —
 *      the row looked misaligned even though the grid was doing its job. The
 *      `flex-1` spacer meant to pin the footer to the bottom did nothing,
 *      because the card it lived in was never taller than its content.
 *
 *   2. **A long selection overflowed the card.** The pick is the longest string
 *      on the face of a card, and it got longer when the board gained a second
 *      source that spells picks out (`"Wolverhampton Wanderers to win"` rather
 *      than a short feed code). The line was a plain `<p>` beside a fixed-width
 *      odds badge, so it could neither shrink nor wrap: it ran under the badge
 *      and, on the fainter-styled rows, past the card edge.
 *
 * The assertions below therefore pin the *geometry*, not the styling: a class
 * list is the only layout contract this stack gives us, and jsdom has no layout
 * engine to measure a real box with.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TipCard } from '@/components/goaledge/TipCard';
import type { Tip } from '@/types/goaledge';

/** Long enough that a single unwrapped line cannot fit a 3-column card. */
const LONG_TIP: Tip = {
  id: 'layout-long',
  homeTeam: 'Wolverhampton Wanderers',
  awayTeam: 'Manchester United',
  league: 'English Premier League',
  country: 'England',
  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  matchTime: '1 Nov, 17:30',
  odds: '2.25',
  confidence: 61,
  confidenceLabel: 'Medium',
  // The exact shape the ESPN odds source produces: club name + " to win".
  prediction: 'Wolverhampton Wanderers to win',
  predictionType: '1X2',
  status: 'upcoming',
  isPremium: false,
  tipster: 'Market consensus',
  homeForm: ['W', 'D', 'L', 'W', 'W'],
  awayForm: ['W', 'W', 'D', 'L', 'W'],
};

function renderTip(overrides: Partial<Tip> = {}) {
  const tip = { ...LONG_TIP, ...overrides };
  const { container } = render(
    <TipCard
      tip={tip}
      onView={() => undefined}
      onAddToSlip={() => undefined}
      inSlip={false}
      onCopy={() => undefined}
    />,
  );
  return container.querySelector('.tip-card') as HTMLElement;
}

afterEach(cleanup);

describe('tip card geometry', () => {
  it('fills the grid cell so every card in a row matches height', () => {
    const card = renderTip();
    expect(card.className).toContain('h-full');
    expect(card.className).toContain('w-full');
    // A min-width of zero is what lets the card's own children shrink instead
    // of forcing the grid column wider than its share.
    expect(card.className).toContain('min-w-0');
  });

  it('lets the selection shrink and wrap instead of running under the odds', () => {
    const card = renderTip();
    const selection = screen.getByText('Wolverhampton Wanderers to win');
    expect(selection.tagName).toBe('P');
    expect(selection.className).toContain('min-w-0');
    expect(selection.className).toContain('flex-1');
    expect(selection.className).toContain('break-words');
    // The price beside it must keep its own width rather than be squeezed.
    expect(card.textContent).toContain('2.25');
  });

  it('shows both teams on a long fixture rather than truncating the away side', () => {
    // The selection repeats the home name, so anchor on the element that holds
    // both sides of the fixture.
    renderTip();
    const fixture = screen.getByText((_, el) => el?.tagName === 'P' && /Wolverhampton Wanderers vs/.test(el.textContent ?? ''));
    // Two clamped lines: an ellipsis after a full away-team name is honest,
    // a hard `truncate` mid-word hid the opponent entirely.
    expect(fixture.className).toContain('line-clamp-2');
    expect(fixture.className).toContain('break-words');
    expect(fixture.className).not.toContain('truncate');
  });

  it('keeps the league name and country to one line each', () => {
    renderTip({ league: 'CONMEBOL Women Copa Libertadores', country: 'North & Central America' });
    expect(screen.getByText('CONMEBOL Women Copa Libertadores').className).toContain('truncate');
    expect(screen.getByText('North & Central America').className).toContain('truncate');
  });

  it('pins the footer to the bottom of a stretched card', () => {
    const card = renderTip();
    // The spacer is what absorbs the extra height; without it the footer sits
    // wherever the content ends and rows look staggered.
    const spacer = card.querySelector('[aria-hidden="true"].flex-1');
    expect(spacer).not.toBeNull();
    expect(card.className).toContain('flex-col');
  });

  it('keeps the tipster line from pushing the footer buttons out of the card', () => {
    renderTip({ tipster: 'Market consensus' });
    const byline = screen.getByText(/by Market consensus/);
    expect(byline.className).toContain('min-w-0');
    expect(byline.className).toContain('truncate');
  });

  it('wraps the best-odds chips rather than widening the card', () => {
    const { container } = render(
      <TipCard
        tip={LONG_TIP}
        onView={() => undefined}
        onAddToSlip={() => undefined}
        inSlip={false}
        onCopy={() => undefined}
        oddsComparison={{
          tipId: LONG_TIP.id,
          market: '1X2',
          bookmakers: [
            { bookmaker: 'Book A', odds: 2.3, isBest: true },
            { bookmaker: 'Book B', odds: 2.25, isBest: false },
            { bookmaker: 'Book C', odds: 2.2, isBest: false },
          ],
        } as never}
        onCompare={() => undefined}
      />,
    );
    const row = container.querySelector('[title="Compare odds across all bookmakers"]')?.parentElement;
    expect(row?.className).toContain('flex-wrap');
  });

  it('survives the longest values both feeds can produce', () => {
    // Nothing may throw, and the card must still be a card.
    const card = renderTip({
      homeTeam: 'Club Atlético Peñarol de Montevideo',
      awayTeam: 'Asociación Deportivo Cali Fútbol Club',
      prediction: 'Asociación Deportivo Cali Fútbol Club to win',
      league: 'CONMEBOL Women Copa Libertadores',
      country: 'North & Central America',
      tipster: 'BetiGolo model',
      analysis: 'x'.repeat(400),
    });
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Asociación Deportivo Cali Fútbol Club to win');
  });
});
