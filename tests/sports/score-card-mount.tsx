import { JSDOM } from 'jsdom';

/**
 * jsdom harness for the dashboard score card the feed draws basketball and
 * American football fixtures with.
 *
 * The card is a client component and Chromium cannot be installed in this
 * sandbox, so the real component is mounted here with react-dom and read the way
 * a reader would: which crest is which side, what the clock says, whether a score
 * is a number or an em dash, who is broadcasting. The markup under test is the
 * component's own, not a copy of it, and it is read through the card's own
 * `data-` hooks rather than through its styling.
 *
 * The feed card that wraps this one cannot be mounted here — it needs the app
 * router — so the link it puts around the card is asserted through
 * `score-card.ts`, which is where that decision actually lives.
 */
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

export type ScoreCardView = {
  /** One row per side, in the order the card renders them: home, then away. */
  rows: { name: string; score: string }[];
  clock: { label: string; tone: string | null };
  crests: string[];
  logos: string[];
  broadcast: string;
  competition: string;
  text: string;
};

export type ScoreCardMount = ScoreCardView & {
  card: any;
  /** Tell the card that a logo did not load, the way a browser does. */
  failLogo: (index: number) => Promise<void>;
  /** Re-read the card after an interaction. */
  read: () => ScoreCardView;
  unmount: () => Promise<void>;
};

function viewOf(container: any): ScoreCardView {
  const card = container.querySelector('[data-score-card]');
  const all = (selector: string) => [...(card?.querySelectorAll(selector) ?? [])];
  const chip = all('span').find((span: any) => span.querySelector('i') && span.className.includes('max-w-[55%]'));
  return {
    rows: all('[data-score-row]').map((row: any) => ({
      name: row.querySelector('span')?.textContent ?? '',
      score: row.querySelector('strong')?.textContent ?? '',
    })),
    clock: {
      label: card?.querySelector('[data-score-clock]')?.textContent ?? '',
      tone: card?.getAttribute('data-clock-tone') ?? null,
    },
    crests: all('[data-team-crest]').map((crest: any) => crest.textContent.trim()),
    logos: all('[data-team-logo]').map((image: any) => image.getAttribute('src')),
    broadcast: card?.querySelector('[data-broadcast]')?.textContent.trim() ?? '',
    competition: chip?.textContent.trim() ?? '',
    text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  };
}

export async function mountScoreCard(event: unknown): Promise<ScoreCardMount> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const SportsScoreCard = (await import('../../src/components/SportsScoreCard')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;

  const container = dom.window.document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SportsScoreCard as never, { event } as never));
  });

  return {
    ...viewOf(container),
    card: container.querySelector('[data-score-card]'),
    failLogo: async (index: number) => {
      const image = container.querySelectorAll('[data-team-logo]')[index];
      await act(async () => {
        image.dispatchEvent(new dom.window.Event('error'));
      });
    },
    read: () => viewOf(container),
    unmount: async () => { await act(() => root.unmount()); },
  };
}
