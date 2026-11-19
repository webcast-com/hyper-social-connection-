import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import { FEED_RENDER_BATCH } from '../../src/lib/feed-interleave';
import type { SportsVideoNewsClip } from '../../src/lib/espn-video-news';
import { installIntersectionObserver, keepEndInRange, scrollToEnd, watchedEnds } from './fake-intersection';

installIntersectionObserver();

/**
 * The feed's fourth tab.
 *
 * What is asserted here is the wiring a reader touches: the tab exists beside
 * the three that were already there, For You is still the default and still
 * holds exactly the cards it held before, and selecting Live shows the sports
 * desk's own cards with a sentence about them that counts only fixtures ESPN
 * reports. The counting rule itself is tested purely in `match-centre.test.ts`,
 * because a match card cannot be mounted in jsdom — it needs the app router —
 * so a live fixture is represented here by the note the tab writes rather than
 * by the card that cannot render.
 */

const clip = (over: Partial<SportsVideoNewsClip> = {}): SportsVideoNewsClip => ({
  id: 'espn-video-epl-49983806',
  clipId: '49983806',
  title: 'Saka curls Arsenal ahead at Brighton',
  description: 'A first-time finish from the edge of the box.',
  league: 'epl',
  leagueName: 'Premier League',
  sport: 'football',
  teams: ['Arsenal', 'Brighton'],
  publishedAt: '2026-11-08T18:05:00Z',
  page: 'https://www.espn.com/video/clip/_/id/49983806',
  thumbnail: 'https://a.espncdn.com/photo/49983806.jpg',
  ...over,
});

const videoPost = (id: string, over: Partial<SportsVideoNewsClip> = {}) => ({
  id: `video-news-${id}`, type: 'video-news', clip: clip(over), createdAt: new Date(),
});

type Props = {
  forYouPosts?: unknown[]; followingPosts?: unknown[]; highlightPosts?: unknown[]; highlightsRemaining?: number; livePosts?: unknown[];
};

async function mountTabs(props: Props = {}) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const FeedTabs = (await import('../../src/components/FeedTabs')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(FeedTabs as never, {
      forYouPosts: props.forYouPosts ?? [],
      followingPosts: props.followingPosts ?? [],
      highlightPosts: props.highlightPosts ?? [],
      highlightsRemaining: props.highlightsRemaining ?? 0,
      livePosts: props.livePosts ?? [],
      currentUser: { id: 1, name: 'Review User' },
      bookmarkedPostIds: [],
      viewerFollowIds: [],
    } as never));
  });

  const tabs = () => [...container.querySelectorAll('[role="group"][aria-label="Feed sections"] button[aria-pressed]')];
  const tab = (label: string) => tabs().find((button: any) => button.textContent.trim() === label);
  const note = () => container.querySelector('[role="status"]');
  return {
    ...mounted,
    container,
    tabs,
    tab,
    note,
    press: async (label: string) => {
      const button = tab(label);
      assert.ok(button, `a tab labelled ${label}`);
      await act(async () => { (button as any).click(); });
    },
    unmount: () => act(() => root.unmount()),
  };
}

test('the Live tab sits beside the three tabs that were already there, and For You is still the default', async () => {
  const view = await mountTabs({ forYouPosts: [videoPost('a')] });
  assert.deepEqual(view.tabs().map((button: any) => button.textContent.trim()), ['For You', 'Following', 'Live', 'Highlights']);
  assert.equal(view.tab('For You')!.getAttribute('aria-pressed'), 'true');
  assert.equal(view.tab('Live')!.getAttribute('aria-pressed'), 'false');
  assert.equal(view.note(), null, 'the default tab makes no claim about live sport');
  assert.match(view.container.textContent!, /Saka curls Arsenal ahead at Brighton/);
  await view.unmount();
});

test('selecting Live shows the desk\u2019s own cards and says honestly that nothing is in play', async () => {
  const view = await mountTabs({
    forYouPosts: [videoPost('a')],
    livePosts: [videoPost('b', { id: 'espn-video-nba-1', clipId: '1', title: 'Curry beats the buzzer in Denver' })],
  });
  await view.press('Live');

  assert.equal(view.tab('Live')!.getAttribute('aria-pressed'), 'true');
  assert.equal(view.tab('For You')!.getAttribute('aria-pressed'), 'false');
  assert.equal(view.note()!.textContent,
    'No fixtures are listed right now. League video ESPN has published is below.');
  assert.match(view.container.textContent!, /Curry beats the buzzer in Denver/, 'the Live tab renders its own cards');
  assert.doesNotMatch(view.container.textContent!, /Saka curls Arsenal ahead at Brighton/,
    'and not the For You cards, which stay in their own tab');
  await view.unmount();
});

test('an empty Live tab offers the way out instead of claiming a live sport', async () => {
  const view = await mountTabs({ forYouPosts: [videoPost('a')], livePosts: [] });
  await view.press('Live');

  assert.equal(view.note(), null, 'an empty tab writes no summary sentence');
  assert.match(view.container.textContent!, /No fixtures on the desk right now/);
  assert.match(view.container.textContent!, /Nothing is invented to fill the gap/);
  const link = [...view.container.querySelectorAll('a')].find((anchor: any) => anchor.textContent.includes('All competitions'));
  assert.equal(link?.getAttribute('href'), '/sports');
  await view.unmount();
});

test('a Live tab with cards but no fixtures does not count them as fixtures', async () => {
  const view = await mountTabs({ livePosts: [videoPost('b'), videoPost('c', { id: 'espn-video-nfl-2', clipId: '2' })] });
  await view.press('Live');

  assert.doesNotMatch(view.note()!.textContent!, /fixture[s]? (is|are) live/);
  assert.match(view.note()!.textContent!, /No fixtures are listed right now/);
  await view.unmount();
});

test('For You is unchanged by what the Live tab was given', async () => {
  const view = await mountTabs({
    forYouPosts: [videoPost('a')],
    livePosts: [videoPost('b', { id: 'espn-video-nba-1', clipId: '1', title: 'Curry beats the buzzer in Denver' })],
  });
  await view.press('Live');
  await view.press('For You');

  assert.equal(view.note(), null, 'the summary sentence belongs to the Live tab alone');
  assert.match(view.container.textContent!, /Saka curls Arsenal ahead at Brighton/);
  assert.doesNotMatch(view.container.textContent!, /Curry beats the buzzer in Denver/);
  await view.unmount();
});

/* ── The batched reveal: endless scrolling, no button ───────────────────── */

/** Many cards, cheaply: the tab's own list is what is under test, not the card. */
const manyPosts = (count: number) => Array.from({ length: count }, (_, index) =>
  videoPost(`bulk-${index}`, { id: `espn-video-epl-${index}`, clipId: String(index), title: `Clip number ${index}` }));

/** The end-of-list marker a tab renders while it still has cards to reveal. */
const endMarker = (container: any) => container.querySelector('[data-infinite-sentinel]');
/** Any button that offers more cards. Endless scrolling has none. */
const moreButton = (container: any) =>
  [...container.querySelectorAll('button')].find((button: any) => /\bmore\b/i.test(button.textContent));
const reactAct = async () => (await import('react')).act as unknown as (fn: () => Promise<void> | void) => Promise<void>;
/** The reader scrolls to the end of what is on screen. */
const scroll = async () => { const act = await reactAct(); await act(async () => { scrollToEnd(); }); };

test('a tab with more cards than one batch renders one batch and no button to press', async () => {
  const total = FEED_RENDER_BATCH * 3 + 5;
  const view = await mountTabs({ livePosts: manyPosts(total) });
  await view.press('Live');

  const rendered = view.container.querySelectorAll('article').length;
  assert.equal(rendered, FEED_RENDER_BATCH, 'only one batch is in the DOM');
  assert.ok(endMarker(view.container), 'the end of the batch is marked');
  assert.equal(watchedEnds(view.container), 1, 'and watched, so scrolling to it reveals more');
  assert.equal(moreButton(view.container), undefined, 'nothing asks the reader to press for more');
  assert.doesNotMatch(view.container.textContent!, /remaining in this tab/);
  await view.unmount();
});

test('scrolling to the end reveals another batch, and the whole list is reachable', async () => {
  const total = FEED_RENDER_BATCH * 2 + 3;
  const view = await mountTabs({ livePosts: manyPosts(total) });
  await view.press('Live');

  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH);
  await scroll();
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH * 2);
  assert.equal(watchedEnds(view.container), 1, 'the new end is watched in turn');

  await scroll();
  assert.equal(view.container.querySelectorAll('article').length, total, 'every card the page built is reachable');
  assert.equal(endMarker(view.container), null, 'and the marker goes away when nothing is left');
  assert.equal(watchedEnds(view.container), 0);
  await view.unmount();
});

test('the last batch reveals what is actually left', async () => {
  const view = await mountTabs({ livePosts: manyPosts(FEED_RENDER_BATCH + 4) });
  await view.press('Live');

  await scroll();
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH + 4);
  assert.equal(endMarker(view.container), null);
  await view.unmount();
});

test('an end that is still in range after a batch arrives keeps revealing, without another scroll', async () => {
  // A window taller than a batch: the end never leaves range, so no "it came
  // into view" event will ever fire again. The list must not stall there.
  const total = FEED_RENDER_BATCH * 3 + 5;
  keepEndInRange(true);
  try {
    const view = await mountTabs({ livePosts: manyPosts(total) });
    await view.press('Live');
    const act = await reactAct();
    for (let turn = 0; turn < 6; turn += 1) await act(async () => { await new Promise((done) => setTimeout(done, 0)); });

    assert.equal(view.container.querySelectorAll('article').length, total);
    assert.equal(endMarker(view.container), null);
    await view.unmount();
  } finally {
    keepEndInRange(false);
  }
});

test('a tab that fits in one batch has no end marker at all', async () => {
  const view = await mountTabs({ livePosts: manyPosts(3) });
  await view.press('Live');

  assert.equal(view.container.querySelectorAll('article').length, 3);
  assert.equal(endMarker(view.container), null, 'nothing is withheld, so nothing waits to be scrolled to');
  assert.equal(watchedEnds(view.container), 0);
  await view.unmount();
});

test('switching tab starts from the first batch again', async () => {
  // Two full batches and a tail, so the second press still has a batch to give.
  const total = FEED_RENDER_BATCH * 2 + 6;
  const view = await mountTabs({ forYouPosts: manyPosts(total), livePosts: manyPosts(total) });
  await scroll();
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH * 2, 'For You was expanded');

  await view.press('Live');
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH,
    'one tab\u2019s scrolling does not decide another\u2019s');
  await view.unmount();
});

/* ── The Highlights tab ─────────────────────────────────────────────────── */

/** A highlight card exactly as the page builds one for the feed. */
const highlightPost = (id: string, over: Record<string, unknown> = {}) => ({
  id: `highlight-${id}`,
  type: 'highlight',
  clip: {
    id,
    title: `Highlight ${id}`,
    description: 'A curled finish from the edge of the box.',
    duration: 47,
    thumbnail: `https://a.espncdn.com/media/2026/0907/${id}.jpg`,
    mp4: `https://a.espncdn.com/media/video/2026/0907/${id}_3600k.mp4`,
    hls: null,
    page: `https://www.espn.com/video/clip/_/id/${id}`,
    playable: true,
    eventId: 'espn-epl-401111111',
    eventName: 'Arsenal vs Chelsea',
    sport: 'football',
    league: 'epl',
    leagueName: 'Premier League',
    home: 'Arsenal',
    away: 'Chelsea',
    homeLogo: null,
    awayLogo: null,
    startAt: '2026-11-08T18:00:00.000Z',
    status: 'final',
    ...over,
  },
  anchor: null,
  engagement: null,
  createdAt: new Date(),
});

const linkTo = (container: any, href: string) =>
  [...container.querySelectorAll('a')].filter((anchor: any) => anchor.getAttribute('href') === href);

test('Highlights took the place of Saved, and shows the highlight cards it was given', async () => {
  const view = await mountTabs({
    forYouPosts: [videoPost('a')],
    highlightPosts: [highlightPost('49861382', { title: 'Saka opens the scoring' }), highlightPost('49861383', { title: 'Palmer levels from the spot' })],
  });
  assert.equal(view.tab('Saved'), undefined, 'the Saved tab is gone');
  assert.equal(view.tab('Highlights')!.getAttribute('aria-pressed'), 'false');
  assert.doesNotMatch(view.container.textContent!, /Saka opens the scoring/, 'its cards stay in their own tab');

  await view.press('Highlights');
  assert.equal(view.tab('Highlights')!.getAttribute('aria-pressed'), 'true');
  assert.equal(view.tab('For You')!.getAttribute('aria-pressed'), 'false');
  assert.equal(view.container.querySelectorAll('article').length, 2);
  assert.match(view.container.textContent!, /Saka opens the scoring/);
  assert.match(view.container.textContent!, /Palmer levels from the spot/);
  assert.doesNotMatch(view.container.textContent!, /Saka curls Arsenal ahead at Brighton/, 'and not the For You cards');
  assert.match(view.container.textContent!, /2 match highlights, newest first\./);
  assert.equal(view.note(), null, 'the count is not a live region: only the Live tab announces itself');
  assert.equal(linkTo(view.container, '/sports/highlights').length, 1, 'one link to the page that filters them');
  await view.unmount();
});

test('an empty Highlights tab says so and points at the highlights page', async () => {
  const view = await mountTabs({ forYouPosts: [videoPost('a')] });
  await view.press('Highlights');

  assert.equal(view.container.querySelectorAll('article').length, 0);
  assert.match(view.container.textContent!, /No match highlights right now/);
  assert.match(view.container.textContent!, /Nothing is invented to fill the gap/);
  const [link] = linkTo(view.container, '/sports/highlights');
  assert.match(link.textContent!, /Match Highlights/);
  await view.unmount();
});

test('the Highlights tab reveals its clips in batches like every other tab', async () => {
  const total = FEED_RENDER_BATCH + 4;
  const view = await mountTabs({
    highlightPosts: Array.from({ length: total }, (_, index) => highlightPost(`bulk-${index}`)),
  });
  await view.press('Highlights');
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH);
  assert.match(view.container.textContent!, new RegExp(`${total} match highlights, newest first`),
    'the count is every clip the tab holds, not the batch on screen');
  await scroll();
  assert.equal(view.container.querySelectorAll('article').length, total, 'every clip the page supplied is reachable');
  assert.equal(endMarker(view.container), null);
  await view.unmount();
});

test('clips the read did not carry are pointed at, once everything it did carry is on screen', async () => {
  const older = (container: any) =>
    linkTo(container, '/sports/highlights').find((anchor: any) => /older clips? on Match Highlights/.test(anchor.textContent));
  const total = FEED_RENDER_BATCH + 2;
  const view = await mountTabs({
    highlightPosts: Array.from({ length: total }, (_, index) => highlightPost(`deep-${index}`)),
    highlightsRemaining: 37,
  });
  await view.press('Highlights');
  assert.equal(older(view.container), undefined, 'not while this tab still has clips of its own to reveal');
  await scroll();
  assert.match(older(view.container)!.textContent!, /37 older clips on Match Highlights/);

  await view.press('For You');
  assert.equal(older(view.container), undefined, 'the pointer belongs to the Highlights tab alone');
  await view.unmount();

  const complete = await mountTabs({ highlightPosts: [highlightPost('only')], highlightsRemaining: 0 });
  await complete.press('Highlights');
  assert.equal(older(complete.container), undefined, 'nothing is claimed when the read carried every stored clip');
  await complete.unmount();
});
