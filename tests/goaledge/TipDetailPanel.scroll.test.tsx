/**
 * The detail panel must be scrollable, and its action bar must stay reachable.
 *
 * What was wrong: the panel was a flex child of a `fixed inset-0` column with no
 * height of its own, so it sized itself to its content. Its body was
 * `flex-1 overflow-y-auto`, but a `flex-1` child of an auto-height parent is
 * simply as tall as its content — there was nothing to scroll, ever. The panel
 * then ran past the bottom of the viewport, taking the "Add to slip" bar with
 * it, and because the panel is fixed-position the page underneath could not
 * scroll either. On a tip with any content at all, the primary action was
 * unreachable.
 *
 * jsdom has no layout engine, so these assertions pin the *contract* the layout
 * depends on rather than measuring a box:
 *
 *   • the panel is bounded (`h-full`) and clip-to-rounded (`overflow-hidden`);
 *   • exactly one region scrolls, and it is the body — with `min-h-0`, without
 *     which `flex-1` refuses to shrink below its content and overflows again;
 *   • the header, tab strip and action bar are `shrink-0` *siblings* of that
 *     region, so they can never be scrolled out of view;
 *   • no leftover spacer pads the end of the scroll area.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TipDetailPanel } from '@/components/goaledge/TipDetailPanel';
import type { Tip } from '@/types/goaledge';

vi.mock('@/app/services/espnTipTable', () => ({
  useTipLeagueTable: () => [],
}));

function tip(overrides: Partial<Tip> = {}): Tip {
  return {
    id: 'panel-1',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'English Premier League',
    country: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    matchTime: '1 Nov, 17:30',
    odds: '1.85',
    confidence: 64,
    confidenceLabel: 'Medium',
    prediction: 'Arsenal to win',
    predictionType: '1X2',
    status: 'upcoming',
    isPremium: false,
    tipster: 'Market consensus',
    homeForm: ['W', 'D', 'W', 'L', 'W'],
    awayForm: ['L', 'D', 'L', 'W', 'D'],
    homeFormStats: { played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 4, cleanSheets: 2 },
    awayFormStats: { played: 5, won: 1, drawn: 2, lost: 2, goalsFor: 5, goalsAgainst: 7, cleanSheets: 1 },
    analysis: 'A long analysis paragraph. '.repeat(40),
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Tip> = {}) {
  const onAddToSlip = vi.fn();
  const onClose = vi.fn();
  const { container } = render(
    <TipDetailPanel
      tip={tip(overrides)}
      betSlipIds={new Set<string>()}
      isPremium={false}
      onClose={onClose}
      onAddToSlip={onAddToSlip}
      onCopy={() => undefined}
      onShare={() => undefined}
      isBookmarked={false}
      onToggleBookmark={() => undefined}
      onUpgrade={() => undefined}
      allTips={[]}
    />,
  );
  const panel = container.querySelector('.tip-detail-panel') as HTMLElement;
  return { container, panel, onAddToSlip, onClose };
}

afterEach(cleanup);

describe('tip detail panel scrolling', () => {
  it('bounds the panel to the viewport instead of letting content size it', () => {
    const { panel } = renderPanel();
    // Full-height bottom sheet on mobile; on desktop the panel keeps its
    // content height but is capped at the viewport, so a long tip scrolls
    // instead of running off the bottom of the screen.
    expect(panel.className).toContain('h-full');
    expect(panel.className).toContain('sm:h-auto');
    expect(panel.className).toContain('sm:max-h-full');
    expect(panel.className).toContain('flex-col');
    // Rounded corners need the panel to clip, and clipping stops a stray child
    // painting over the backdrop.
    expect(panel.className).toContain('overflow-hidden');
  });

  it('has exactly one scrolling region, and it is the body', () => {
    const { panel } = renderPanel();
    const scrollers = Array.from(panel.querySelectorAll('*')).filter((el) =>
      /(^|\s)overflow-y-auto(\s|$)/.test(el.className),
    );
    expect(scrollers).toHaveLength(1);

    const body = scrollers[0] as HTMLElement;
    // `flex-1` gives it the leftover height; `min-h-0` lets a flex child
    // actually shrink to it instead of expanding to its content.
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('min-h-0');
    expect(body.className).toContain('overscroll-contain');
  });

  it('keeps the header, tabs and action bar outside the scroller', () => {
    const { panel } = renderPanel();
    const body = Array.from(panel.querySelectorAll('*')).find((el) =>
      /(^|\s)overflow-y-auto(\s|$)/.test(el.className),
    ) as HTMLElement;

    // The fixture headline is the panel's <h2>; both team names live inside it,
    // so match on the element rather than on a text node.
    const header = panel.querySelector('h2') as HTMLElement;
    expect(header.textContent).toContain('Arsenal');
    expect(body.contains(header)).toBe(false);

    const addButton = screen.getByRole('button', { name: /Add to slip/ });
    expect(body.contains(addButton)).toBe(false);

    // Everything that is not the scroller is fixed furniture: each direct child
    // of the panel's flex column holds its own height, so only the body flexes.
    const furniture = Array.from(panel.children).filter((el) => el !== body);
    expect(furniture.length).toBeGreaterThanOrEqual(3); // handle, header, footer
    for (const el of furniture) {
      expect(el.className, `panel child should not flex: ${el.className}`).toContain('shrink-0');
    }
  });

  it('does not hold the action bar in place with `sticky bottom-0` any more', () => {
    // It was `sticky`, which only does anything inside a scroller — and it was
    // a sibling of the scroller, so the class was a no-op that hid the real
    // problem. As a flex row it is always on screen.
    const { panel } = renderPanel();
    const bar = screen.getByRole('button', { name: /Add to slip/ }).closest('div[class*="border-t"]');
    expect(bar).not.toBeNull();
    expect(bar!.className).not.toContain('sticky');
    expect(bar!.className).toContain('shrink-0');
  });

  it('drops the old footer spacer from the end of the scroll area', () => {
    const { panel } = renderPanel();
    // The h-24/h-20 block only existed to clear a floating footer; with a real
    // flex footer it is dead scroll at the bottom of every panel.
    expect(panel.querySelector('.h-24')).toBeNull();
    expect(panel.querySelector('.sm\\:h-20')).toBeNull();
  });

  it('keeps the tab strip inside the scroller so it sticks to its top', () => {
    const { panel } = renderPanel();
    const body = Array.from(panel.querySelectorAll('*')).find((el) =>
      /(^|\s)overflow-y-auto(\s|$)/.test(el.className),
    ) as HTMLElement;
    const overview = screen.getByRole('button', { name: /Overview/i });
    expect(body.contains(overview)).toBe(true);
  });

  it('still wires the primary action while the body scrolls', () => {
    const { onAddToSlip } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Add to slip/ }));
    expect(onAddToSlip).toHaveBeenCalledTimes(1);
  });

  it('keeps the action bar inside the panel even with a very long analysis', () => {
    const { panel } = renderPanel({ analysis: 'x '.repeat(4000) });
    const addButton = screen.getByRole('button', { name: /Add to slip/ });
    expect(panel.contains(addButton)).toBe(true);
  });

  it('gives the action bar the home-indicator inset on mobile', () => {
    const { panel } = renderPanel();
    const bar = screen.getByRole('button', { name: /Add to slip/ }).closest('div[class*="border-t"]');
    expect(bar!.className).toContain('safe-area-inset-bottom');
  });
});
