import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard } from '../sports/leaders-post-cards';
import { absoluteShareUrl, buildProfileUrl, postPath, profilePath } from '../../src/lib/share';

/**
 * The share sheet.
 *
 * It was the profile page's share dialog, and it is now what Share opens on a
 * post, a highlight, a player card, a league clip, a match and a prediction as
 * well. These tests hold the two halves of that: the profile's dialog is still
 * the dialog it was, and the same sheet carries anything else — with the caller,
 * not the sheet, deciding how the thing reaches a feed or an inbox.
 *
 * What the server allows (blocks, message privacy, private groups) is checked
 * against a real database in a browser; see SHARE_SHEET.md.
 */

/* ── The link a share carries ───────────────────────────────────────────── */

test('a path on this site gets the origin; a provider\u2019s full address is kept; nothing else is a link', () => {
  assert.equal(absoluteShareUrl('https://hyper.co.ke', '/post/12'), 'https://hyper.co.ke/post/12');
  assert.equal(absoluteShareUrl('https://hyper.co.ke/', '/sports/predictions'), 'https://hyper.co.ke/sports/predictions');
  assert.equal(absoluteShareUrl('https://hyper.co.ke', 'https://www.espn.com/video/clip?id=1'), 'https://www.espn.com/video/clip?id=1');
  for (const hostile of ['javascript:alert(1)', '//evil.example/x', 'data:text/html,x', 'evil.example', '']) {
    assert.equal(absoluteShareUrl('https://hyper.co.ke', hostile), 'https://hyper.co.ke/', hostile);
  }
});

test('a profile\u2019s link is what it always was', () => {
  assert.equal(profilePath(4, 'maya p'), '/profile/4?u=maya%20p');
  assert.equal(profilePath(4, null), '/profile/4');
  assert.equal(buildProfileUrl('https://hyper.co.ke/', 4, 'maya'), 'https://hyper.co.ke/profile/4?u=maya');
  assert.equal(postPath(91), '/post/91');
});

/* ── The sheet ──────────────────────────────────────────────────────────── */

type Calls = { feed: [string, number | null][]; sent: [number, string][]; recorded: string[]; shared: number; closed: number };

async function mountSheet(props: Record<string, unknown> = {}, results: { feed?: unknown; send?: unknown } = {}) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const ShareSheet = (await import('../../src/components/ShareSheet')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  const calls: Calls = { feed: [], sent: [], recorded: [], shared: 0, closed: 0 };
  await act(async () => {
    root.render(React.createElement(ShareSheet as never, {
      subject: {
        noun: 'post',
        title: 'Shipped a major feature after a 72-hour sprint',
        subtitle: 'Sophie Chen \u00b7 post',
        image: null,
        link: '/post/7',
        text: 'Check out this post by Sophie Chen on Hyper',
        feedHint: 'Reposts it to your followers, with your note above it if you add one.',
      },
      onClose: () => { calls.closed += 1; },
      shareToFeed: async (message: string, groupId: number | null) => {
        calls.feed.push([message, groupId]);
        return results.feed ?? { success: true, message: 'Shared to your feed' };
      },
      sendTo: async (receiverId: number, note: string) => {
        calls.sent.push([receiverId, note]);
        return results.send ?? { success: true, message: 'Post sent' };
      },
      record: (channel: string) => { calls.recorded.push(channel); },
      onShared: () => { calls.shared += 1; },
      ...props,
    } as never));
  });
  const sheet = () => mounted.document.querySelector('[role="dialog"][aria-labelledby="share-sheet-title"]') as any;
  const button = (label: string) => [...sheet().querySelectorAll('button')].find((node: any) => node.textContent.trim().startsWith(label)) as any;
  return {
    ...mounted,
    calls,
    sheet,
    button,
    press: async (label: string) => { await act(async () => { button(label).click(); await new Promise((resolve) => setTimeout(resolve, 5)); }); },
    type: async (value: string) => {
      await act(async () => {
        const area = sheet().querySelector('textarea');
        Object.getOwnPropertyDescriptor(mounted.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value);
        area.dispatchEvent(new mounted.window.Event('input', { bubbles: true }));
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

const tabLabels = (sheet: any) => [...sheet.querySelectorAll('button')]
  .map((node: any) => node.textContent.trim())
  .filter((label: string) => ['Feed', 'Groups', 'Send to', 'Elsewhere'].includes(label));

test('the sheet names what is shared, shows its link, and offers the four ways to share it', async () => {
  const view = await mountSheet();
  const sheet = view.sheet();
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal(sheet.querySelector('h2').textContent.trim(), 'Share post');
  assert.match(sheet.textContent, /Shipped a major feature after a 72-hour sprint/);
  assert.match(sheet.textContent, /Sophie Chen \u00b7 post/);
  assert.equal(sheet.querySelector('input[aria-label="Post link"]').value, 'https://hyper.co.ke/post/7');
  assert.deepEqual(tabLabels(sheet), ['Feed', 'Groups', 'Send to', 'Elsewhere']);
  assert.equal(sheet.querySelector('textarea').getAttribute('placeholder'), 'Say something about this post (optional)\u2026');
  assert.match(sheet.textContent, /Share to your feed/);
  assert.match(sheet.textContent, /Reposts it to your followers/);
  assert.equal(view.document.body.style.overflow, 'hidden', 'the page behind does not scroll');
  await view.unmount();
  assert.equal(view.document.body.style.overflow, '');
});

test('sharing to the feed hands the note to the caller, says what happened, and reports the share', async () => {
  const view = await mountSheet();
  await view.type('Worth a read');
  await view.press('Share to your feed');
  assert.deepEqual(view.calls.feed, [['Worth a read', null]], 'the feed, not a group');
  assert.match(view.sheet().textContent, /Shared to your feed/);
  assert.equal(view.calls.shared, 1);
  assert.deepEqual(view.calls.sent, []);
  await view.unmount();
});

test('a share the server refuses is shown as refused, and nothing is reported as shared', async () => {
  const view = await mountSheet({}, { feed: { success: false, message: 'Posts from a private group can only be shared inside that group' } });
  await view.press('Share to your feed');
  assert.match(view.sheet().textContent, /Posts from a private group can only be shared inside that group/);
  assert.equal(view.calls.shared, 0);
  assert.equal(view.calls.closed, 0, 'the sheet stays open so the reason can be read');
  await view.unmount();
});

test('copying the link and handing off to another network are counted where the caller counts them', async () => {
  const opened: string[] = [];
  const view = await mountSheet();
  (view.window as any).open = (url: string) => { opened.push(url); return null; };
  (globalThis as any).window.open = (view.window as any).open;
  await view.press('Copy');
  assert.match(view.sheet().textContent, /Post link copied to your clipboard\./);
  await view.press('Elsewhere');
  assert.equal(view.sheet().querySelector('textarea'), null, 'a note is for shares on this site');
  await view.press('WhatsApp');
  assert.deepEqual(view.calls.recorded, ['copy_link', 'whatsapp']);
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith('https://wa.me/?text='));
  assert.ok(decodeURIComponent(opened[0]).includes('Check out this post by Sophie Chen on Hyper https://hyper.co.ke/post/7'));
  await view.unmount();
});

test('a guest gets the link and the other networks, and none of the ways that need an account', async () => {
  const view = await mountSheet({ canShareInternally: false });
  const sheet = view.sheet();
  assert.deepEqual(tabLabels(sheet), ['Elsewhere']);
  assert.equal(sheet.querySelector('textarea'), null);
  assert.ok(!sheet.textContent.includes('Share to your feed'));
  assert.match(sheet.textContent, /Facebook/);
  assert.equal(sheet.querySelector('input[aria-label="Post link"]').value, 'https://hyper.co.ke/post/7');
  await view.unmount();
});

test('Escape and the backdrop close it; a press inside does not', async () => {
  const view = await mountSheet();
  const React = await import('react');
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  await act(async () => { view.sheet().querySelector('h2').click(); });
  assert.equal(view.calls.closed, 0);
  await act(async () => { view.window.dispatchEvent(new view.window.KeyboardEvent('keydown', { key: 'Escape' })); });
  assert.equal(view.calls.closed, 1);
  await act(async () => { view.sheet().click(); });
  assert.equal(view.calls.closed, 2);
  await view.unmount();
});

/* ── What each kind of thing puts in the sheet ──────────────────────────── */

test('a member\u2019s post is shared by its text, its picture and its own address', async () => {
  const { postShareSubject } = await import('../../src/components/ShareSheets');
  const withPhoto = postShareSubject({ id: 3, content: '  Just finished my latest\n digital painting  ', imageUrl: '/uploads/a.jpg', user: { name: 'Maya Patel', avatar: '/m.jpg' } });
  assert.equal(withPhoto.noun, 'post');
  assert.equal(withPhoto.title, 'Just finished my latest digital painting');
  assert.equal(withPhoto.subtitle, 'Maya Patel \u00b7 post');
  assert.equal(withPhoto.image, '/uploads/a.jpg');
  assert.equal(withPhoto.imageShape, 'square');
  assert.equal(withPhoto.link, '/post/3');

  const textOnly = postShareSubject({ id: 4, content: 'x'.repeat(300), user: { name: 'Maya Patel', avatar: '/m.jpg' } });
  assert.equal(textOnly.title.length, 120);
  assert.ok(textOnly.title.endsWith('\u2026'));
  assert.equal(textOnly.image, '/m.jpg', 'no picture in the post: its author stands for it');
  assert.equal(textOnly.imageShape, 'round');

  // A bare repost says nothing of its own, so the sheet shows what it carries.
  const repost = postShareSubject({ id: 9, content: '\ud83d\udd01 Reposted', user: { name: 'Alex Rivera' }, repostOf: { content: 'Dropped a new original track today!', imageUrl: '/t.jpg' } });
  assert.equal(repost.title, 'Dropped a new original track today!');
  assert.equal(repost.image, '/t.jpg');
  assert.equal(repost.link, '/post/9', 'but the link is the post that was pressed');

  const empty = postShareSubject({ id: 5, content: '', user: null });
  assert.equal(empty.title, "Someone's post");
  assert.equal(empty.image, null);
});

test('the profile\u2019s share dialog is still the dialog it was', async () => {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const ShareProfileModal = (await import('../../src/components/ShareProfileModal')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
  await act(async () => {
    root.render(React.createElement(AppRouterContext.Provider, { value: router as never },
      React.createElement(ShareProfileModal as never, {
        profile: { id: 2, name: 'Maya Patel', username: 'maya', avatar: null },
        onClose: () => {},
      } as never)));
  });
  const sheet = mounted.document.querySelector('[role="dialog"]') as any;
  assert.equal(sheet.querySelector('h2').textContent.trim(), 'Share profile');
  assert.match(sheet.textContent, /Maya Patel/);
  assert.match(sheet.textContent, /@maya/);
  assert.equal(sheet.querySelector('input[aria-label="Profile link"]').value, 'https://hyper.co.ke/profile/2?u=maya');
  assert.deepEqual(tabLabels(sheet), ['Feed', 'Groups', 'Send to', 'Elsewhere']);
  assert.equal(sheet.querySelector('textarea').getAttribute('placeholder'), 'Say something about this profile (optional)\u2026');
  assert.match(sheet.textContent, /Share to your feed/);
  assert.match(sheet.textContent, /Posts a profile card your followers will see\./);
  // No avatar: the member's initial in a round tile, as before.
  const tile = sheet.querySelector('.rounded-full.bg-gradient-to-tr');
  assert.equal(tile.textContent.trim(), 'M');
  await act(() => root.unmount());
});

test('a message drops the hashtag line a feed post ends with, and nothing else', async () => {
  const { messageTextFromPost } = await import('../../src/lib/share');
  assert.equal(
    messageTextFromPost('🎬 Weekend in ninety seconds\nArsenal · Chelsea\nhttps://www.espn.com/video/clip?id=1\n\n#Sports #Highlights #HyperSports'),
    '🎬 Weekend in ninety seconds\nArsenal · Chelsea\nhttps://www.espn.com/video/clip?id=1',
  );
  // A hashtag the member wrote inside a sentence is theirs.
  assert.equal(messageTextFromPost('Watch this #COYG moment\n\n#Sports'), 'Watch this #COYG moment');
  // A text that is only hashtags is not emptied.
  assert.equal(messageTextFromPost('#Sports #Highlights'), '#Sports #Highlights');
  assert.equal(messageTextFromPost(''), '');
});
