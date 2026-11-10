import { JSDOM } from 'jsdom';

/**
 * jsdom harness for the homepage players board.
 *
 * The board is a client component, and Chromium cannot be installed in this
 * sandbox, so the real component is mounted here with react-dom and driven the
 * way a reader would: click Like, write a comment, open Share. The markup under
 * test is the component's own, not a copy.
 */

type Mount = {
  window: any;
  document: any;
  click: (element: any) => Promise<void>;
  type: (element: any, value: string) => Promise<void>;
  unmount: () => void;
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://hyper.co.ke/',
  pretendToBeVisual: true,
});

(globalThis as any).window = dom.window;
(globalThis as any).self = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).requestAnimationFrame = (callback: any) => setTimeout(callback, 0);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Boards built from the real normaliser, in the shape the feed hands the page. */
export async function boardsFor() {
  const { normalizeLeaders } = await import('../../src/lib/espn-leaders');
  const board = (sport: 'basketball' | 'football', league: string, rows: unknown[]) =>
    ({ sport, league, rows, status: 'live', source: { ok: true, url: 'https://espn.test/leaders', httpStatus: 200 } }) as never;
  const basketballPayload = {
    categories: [
      { displayName: 'Points Per Game Leaders', leaders: [{ athlete: { id: '3945274', displayName: 'Luka Dončić', jersey: '77', position: { abbreviation: 'PG' }, team: { displayName: 'Dallas Mavericks', abbreviation: 'DAL', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/dal.png' }] }, headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png' } }, displayValue: '33.9' }] },
      { displayName: 'Rebounds Per Game Leaders', leaders: [{ athlete: { id: '3202', displayName: 'Nikola Jokić', team: { displayName: 'Denver Nuggets', abbreviation: 'DEN', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/den.png' }] } }, displayValue: '12.4' }] },
    ],
  };
  const footballPayload = {
    categories: [
      { displayName: 'Passing Yards Leaders', leaders: [{ athlete: { id: '3916387', displayName: 'Lamar Jackson', position: { abbreviation: 'QB' }, team: { displayName: 'Baltimore Ravens', abbreviation: 'BAL', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png' }] } }, displayValue: '3,678' }] },
    ],
  };
  return {
    basketball: board('basketball', 'nba', normalizeLeaders(basketballPayload, 'basketball')),
    football: board('football', 'nfl', normalizeLeaders(footballPayload, 'football')),
  } as never;
}

export async function mountBoard(boards: unknown): Promise<Mount> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const SportsLeadersBoard = (await import('../../src/components/SportsLeadersBoard')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;

  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SportsLeadersBoard as never, { boards } as never));
  });

  return {
    window: dom.window,
    document: dom.window.document,
    click: async (element) => { await act(async () => { element.click(); }); },
    type: async (element, value) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

export const findButton = (document: any, label: string) =>
  [...document.querySelectorAll('button')].find((button: any) => button.getAttribute('aria-label') === label);
