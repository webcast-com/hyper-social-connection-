import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from './leaders-post-cards';
import { orderSavedPosts } from '../../src/lib/saved-posts';

/**
 * The Saved section of a member's own profile.
 *
 * The home feed's Saved tab became Highlights, and this is where a member's
 * bookmarks are listed now. It lives beside the feed-tab tests because it is the
 * other half of that change: what the tab used to show must still be reachable,
 * under the same rules, and must not be reachable by anyone else.
 *
 * A post card cannot be mounted in jsdom — it needs the app router — so the
 * component tests here cover the switch, the privacy boundary and the empty
 * states, and `orderSavedPosts` covers which posts are listed and in what order.
 */

const post = (id: number, over: Record<string, unknown> = {}) => ({ id, userId: 2, scheduledAt: null, ...over });
const bookmark = (id: number, postId: number, createdAt: string) => ({ id, postId, createdAt });

/* ── Which posts, in what order ─────────────────────────────────────────── */

test('saved posts run most recently saved first, not in the order they were posted', () => {
  const posts = [post(10), post(11), post(12)];
  const saved = orderSavedPosts([
    bookmark(1, 12, '2026-11-01T10:00:00Z'),
    bookmark(2, 10, '2026-11-14T10:00:00Z'),
    bookmark(3, 11, '2026-11-07T10:00:00Z'),
  ], posts);
  assert.deepEqual(saved.map((item) => item.id), [10, 11, 12]);
});

test('two saves at the same instant fall back to the newest bookmark row', () => {
  const saved = orderSavedPosts([
    bookmark(5, 10, '2026-11-14T10:00:00Z'),
    bookmark(6, 11, '2026-11-14T10:00:00Z'),
  ], [post(10), post(11)]);
  assert.deepEqual(saved.map((item) => item.id), [11, 10]);
});

test('a post saved twice is listed once, at its most recent save', () => {
  const saved = orderSavedPosts([
    bookmark(1, 10, '2026-11-01T10:00:00Z'),
    bookmark(2, 11, '2026-11-05T10:00:00Z'),
    bookmark(3, 10, '2026-11-09T10:00:00Z'),
  ], [post(10), post(11)]);
  assert.deepEqual(saved.map((item) => item.id), [10, 11]);
});

test('the rules the Saved tab had are kept: no blocked or muted author, nothing still scheduled', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const posts = [
    post(10),
    post(11, { userId: 7 }),
    post(12, { scheduledAt: '2026-11-16T09:00:00Z' }),
    post(13, { scheduledAt: '2026-11-14T09:00:00Z' }),
  ];
  const bookmarks = [10, 11, 12, 13].map((postId, index) => bookmark(index + 1, postId, `2026-11-1${index}T10:00:00Z`));
  const saved = orderSavedPosts(bookmarks, posts, { hiddenAuthorIds: new Set([7]), now });
  assert.deepEqual(saved.map((item) => item.id), [13, 10],
    'the hidden author and the unpublished post are out; a schedule that has passed is a published post');
});

test('a bookmark whose post is gone is skipped rather than rendered empty', () => {
  const saved = orderSavedPosts([bookmark(1, 99, '2026-11-14T10:00:00Z'), bookmark(2, 10, '2026-11-13T10:00:00Z')], [post(10)]);
  assert.deepEqual(saved.map((item) => item.id), [10]);
  assert.deepEqual(orderSavedPosts([], [post(10)]), []);
});

/* ── The section on the profile ─────────────────────────────────────────── */

async function mountProfileTabs(props: Record<string, unknown>) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const ProfilePostTabs = (await import('../../src/components/ProfilePostTabs')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ProfilePostTabs as never, {
      posts: [],
      currentUser: { id: 1, name: 'Review User' },
      ...props,
    } as never));
  });
  const tabs = () => [...container.querySelectorAll('[role="group"][aria-label="Profile sections"] button[aria-pressed]')] as any[];
  const tab = (label: string) => tabs().find((button) => button.textContent.includes(label));
  return {
    container,
    tabs,
    tab,
    press: async (label: string) => { await act(async () => { tab(label).click(); }); },
    unmount: () => act(() => root.unmount()),
  };
}

test('somebody else\u2019s profile has no Saved section at all', async () => {
  const view = await mountProfileTabs({ savedPosts: null, initialTab: 'saved' });
  assert.equal(view.tabs().length, 0, 'no switch, so no way to a saved list');
  assert.equal(view.container.querySelector('h2')!.textContent, 'Posts');
  assert.doesNotMatch(view.container.textContent!, /Saved|saved/);
  assert.match(view.container.textContent!, /No posts yet/, 'and `?tab=saved` on another profile still shows their posts');
  await view.unmount();
});

test('your own profile offers Posts and Saved, opens on Posts, and counts both', async () => {
  const view = await mountProfileTabs({ savedPosts: [] });
  assert.deepEqual(view.tabs().map((button) => button.textContent.replace(/\d+/g, '').trim()), ['Posts', 'Saved']);
  assert.equal(view.tab('Posts').getAttribute('aria-pressed'), 'true');
  assert.equal(view.tab('Saved').getAttribute('aria-pressed'), 'false');
  assert.match(view.tab('Saved').textContent, /0/);
  assert.match(view.container.textContent!, /No posts yet/);

  await view.press('Saved');
  assert.equal(view.tab('Saved').getAttribute('aria-pressed'), 'true');
  assert.equal(view.container.querySelector('h2')!.textContent, 'Saved');
  assert.match(view.container.textContent!, /No saved posts yet/);
  assert.match(view.container.textContent!, /Click the bookmark icon on any post to save it/);
  assert.match(view.container.textContent!, /Only you can see what you have saved/);
  assert.doesNotMatch(view.container.textContent!, /No posts yet/);

  await view.press('Posts');
  assert.match(view.container.textContent!, /No posts yet/);
  assert.doesNotMatch(view.container.textContent!, /Only you can see/);
  await view.unmount();
});

test('`?tab=saved` opens the Saved section directly on your own profile', async () => {
  const view = await mountProfileTabs({ savedPosts: [], initialTab: 'saved' });
  assert.equal(view.tab('Saved').getAttribute('aria-pressed'), 'true');
  assert.match(view.container.textContent!, /No saved posts yet/);
  await view.unmount();
});

test('a saved list that could not be read says so instead of claiming nothing is saved', async () => {
  const view = await mountProfileTabs({ savedPosts: [], savedUnavailable: true, initialTab: 'saved' });
  assert.match(view.container.textContent!, /Saved posts could not be loaded/);
  assert.match(view.container.textContent!, /Your saved posts are still there/);
  assert.doesNotMatch(view.container.textContent!, /No saved posts yet/);
  await view.unmount();
});
