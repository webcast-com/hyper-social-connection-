import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import { FEED_RENDER_BATCH } from '../../src/lib/feed-interleave';
import type { SportsVideoNewsClip } from '../../src/lib/espn-video-news';

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
  forYouPosts?: unknown[]; followingPosts?: unknown[]; savedPosts?: unknown[]; livePosts?: unknown[];
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
      savedPosts: props.savedPosts ?? [],
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
  assert.deepEqual(view.tabs().map((button: any) => button.textContent.trim()), ['For You', 'Following', 'Live', 'Saved']);
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

/* ── The batched reveal ─────────────────────────────────────────────────── */

/** Many cards, cheaply: the tab's own list is what is under test, not the card. */
const manyPosts = (count: number) => Array.from({ length: count }, (_, index) =>
  videoPost(`bulk-${index}`, { id: `espn-video-epl-${index}`, clipId: String(index), title: `Clip number ${index}` }));

const showMore = (container: any) =>
  [...container.querySelectorAll('button')].find((button: any) => button.textContent.includes('remaining in this tab'));

test('a tab with more cards than one batch renders one batch and says how many are left', async () => {
  const total = FEED_RENDER_BATCH * 3 + 5;
  const view = await mountTabs({ livePosts: manyPosts(total) });
  await view.press('Live');

  const rendered = view.container.querySelectorAll('article').length;
  assert.equal(rendered, FEED_RENDER_BATCH, 'only one batch is in the DOM');
  const button = showMore(view.container)!;
  assert.ok(button, 'a control offers the rest');
  assert.match(button.textContent!, new RegExp(`Show ${FEED_RENDER_BATCH} more`));
  assert.match(button.textContent!, new RegExp(`${total - FEED_RENDER_BATCH} remaining in this tab`),
    'the count is honest about what is still to come');
  await view.unmount();
});

test('pressing it reveals another batch, and the whole list is reachable', async () => {
  const total = FEED_RENDER_BATCH * 2 + 3;
  const view = await mountTabs({ livePosts: manyPosts(total) });
  await view.press('Live');
  const act = (await import('react')).act as unknown as (fn: () => Promise<void> | void) => Promise<void>;

  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH);
  await act(async () => { showMore(view.container)!.click(); });
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH * 2);

  await act(async () => { showMore(view.container)!.click(); });
  assert.equal(view.container.querySelectorAll('article').length, total, 'every card the page built is reachable');
  assert.equal(showMore(view.container), undefined, 'and the control goes away when nothing is left');
  await view.unmount();
});

test('the last batch offers what is actually left, not a full one', async () => {
  const view = await mountTabs({ livePosts: manyPosts(FEED_RENDER_BATCH + 4) });
  await view.press('Live');
  const act = (await import('react')).act as unknown as (fn: () => Promise<void> | void) => Promise<void>;

  await act(async () => { showMore(view.container)!.click(); });
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH + 4);
  assert.equal(showMore(view.container), undefined);
  await view.unmount();
});

test('a tab that fits in one batch shows no control at all', async () => {
  const view = await mountTabs({ livePosts: manyPosts(3) });
  await view.press('Live');

  assert.equal(view.container.querySelectorAll('article').length, 3);
  assert.equal(showMore(view.container), undefined, 'nothing is withheld, so nothing offers more');
  await view.unmount();
});

test('switching tab starts from the first batch again', async () => {
  // Two full batches and a tail, so the second press still has a batch to give.
  const total = FEED_RENDER_BATCH * 2 + 6;
  const view = await mountTabs({ forYouPosts: manyPosts(total), livePosts: manyPosts(total) });
  const act = (await import('react')).act as unknown as (fn: () => Promise<void> | void) => Promise<void>;

  await act(async () => { showMore(view.container)!.click(); });
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH * 2, 'For You was expanded');

  await view.press('Live');
  assert.equal(view.container.querySelectorAll('article').length, FEED_RENDER_BATCH,
    'one tab\u2019s scrolling does not decide another\u2019s');
  await view.unmount();
});
