import { JSDOM } from 'jsdom';

/**
 * jsdom harness for the homepage players board.
 *
 * The board is a client component, and Chromium cannot be installed in this
 * sandbox, so the real component is mounted here with react-dom and driven the
 * way a reader would: submit Like, write a comment, open Share. The markup under
 * test is the component's own, not a copy.
 *
 * A card's controls are server actions, and this harness has neither a request
 * scope nor a database, so the app's own offline switch keeps them honest no-ops
 * instead of reaching for a session. What is asserted here is the wiring and the
 * rendered saved state; `anchor-db.test.ts` exercises the writes against a real
 * database.
 */
process.env.FORCE_OFFLINE_MODE = 'true';

type Mount = {
  window: any;
  document: any;
  click: (element: any) => Promise<void>;
  type: (element: any, value: string) => Promise<void>;
  submit: (form: any) => Promise<void>;
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
// React builds a form action's payload with `new FormData(formElement)`. Node's
// own FormData cannot convert a jsdom element, so the jsdom implementations are
// used instead — without this the action silently never fires here.
(globalThis as any).FormData = dom.window.FormData;
(globalThis as any).Event = dom.window.Event;
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

export async function mountBoard(boards: unknown, options: { engagement?: unknown; signedIn?: boolean } = {}): Promise<Mount> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const SportsLeadersBoard = (await import('../../src/components/SportsLeadersBoard')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;

  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SportsLeadersBoard as never, {
      boards,
      engagement: options.engagement ?? {},
      signedIn: options.signedIn ?? false,
    } as never));
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
    // Form actions are how a post's controls reach the server, so the harness
    // drives them the way a browser does: submit the form, not just click.
    submit: async (form) => {
      await act(async () => {
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

export const findButton = (document: any, label: string) =>
  [...document.querySelectorAll('button')].find((button: any) => button.getAttribute('aria-label') === label);

/**
 * Saved engagement exactly as the page hands it to a card: keyed by the anchor's
 * external key, holding the post id, the real counts, this viewer's own like and
 * bookmark, and the visible end of the thread.
 */
export function engagementFixture(key: string, over: Record<string, unknown> = {}) {
  return {
    [key]: {
      postId: 77,
      likesCount: 3,
      commentsCount: 2,
      viewerLiked: true,
      viewerSaved: false,
      comments: [
        { id: 11, content: 'Historic season', createdAt: '2026-11-08T18:05:00.000Z', author: { id: 2, name: 'Maya Patel', avatar: null } },
        { id: 12, content: 'The efficiency is absurd', createdAt: '2026-11-08T18:09:00.000Z', author: { id: 3, name: 'Jordan Kim', avatar: 'https://example.test/jordan.png' } },
      ],
      ...over,
    },
  };
}

/** The external key a leaders card is anchored under. */
export async function leaderKeyFor(boards: any, sport: 'basketball' | 'football', index = 0): Promise<string> {
  const { anchorKey, leaderAnchorId } = await import('../../src/lib/sports-anchor');
  return anchorKey({ kind: 'leader', id: leaderAnchorId(sport, boards[sport].rows[index]) });
}
