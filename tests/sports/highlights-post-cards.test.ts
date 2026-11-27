import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementFixture, mountBoard, findButton } from './leaders-post-cards';
import type { SportsHighlightsBoard } from '../../src/lib/espn-highlights-feed';

/**
 * The match highlights board as posts: the crest is the home team, the fixture
 * is the card title, the clip is the post video block, and the Like / Comment /
 * Share row behaves the way it does on a post.
 */

const clip = (over: Record<string, unknown> = {}) => ({
  id: '49861382',
  title: 'Saka opens the scoring',
  description: 'A curled finish from the edge of the box.',
  duration: 47,
  thumbnail: 'https://a.espncdn.com/media/2026/0907/49861382.jpg',
  mp4: 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4',
  hls: null,
  page: 'https://www.espn.com/video/clip/_/id/49861382',
  playable: true,
  eventId: 'espn-epl-401111111',
  eventName: 'Arsenal vs Chelsea',
  sport: 'football',
  league: 'epl',
  leagueName: 'Premier League',
  home: 'Arsenal',
  away: 'Chelsea',
  homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
  awayLogo: null,
  startAt: '2026-11-08T18:00:00.000Z',
  status: 'final',
  ...over,
});

const board = (clips: unknown[], status: SportsHighlightsBoard['status'] = 'live'): SportsHighlightsBoard => ({
  clips: clips as never,
  status,
  games: clips.length,
  source: { ok: true, url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401111111', httpStatus: 200 },
});

/** The external key this clip's card is anchored under. */
async function highlightKeyFor(clips: unknown[], index = 0): Promise<string> {
  const { anchorKey, highlightAnchorId } = await import('../../src/lib/sports-anchor');
  return anchorKey({ kind: 'highlight', id: highlightAnchorId(clips[index] as never) });
}

async function mountHighlights(clips: unknown[], status?: SportsHighlightsBoard['status'], options: { engagement?: unknown; signedIn?: boolean; layout?: 'stack' | 'row' } = {}) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  // An empty leaders board keeps the shared document clean for this section.
  const mounted = await mountBoard({ basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } }, football: { sport: 'football', league: 'nfl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } } });
  const SportsHighlightsFeed = (await import('../../src/components/SportsHighlightsFeed')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SportsHighlightsFeed as never, {
    board: board(clips, status),
    engagement: options.engagement ?? {},
    signedIn: options.signedIn ?? false,
    ...(options.layout ? { layout: options.layout } : {}),
  } as never)); });
  return {
    ...mounted,
    // Both roots come down, so the next test starts from an empty document.
    unmount: async () => {
      await act(() => root.unmount());
      container.remove();
      await mounted.unmount();
    },
  };
}

/** The share sheet is a dialog on the page, not part of the card. */
const shareSheet = (document: any) => document.querySelector('[role="dialog"][aria-labelledby="share-sheet-title"]');
const sheetTabs = (sheet: any) => [...sheet.querySelectorAll('button')]
  .map((button: any) => button.textContent.trim())
  .filter((label: string) => ['Feed', 'Groups', 'Send to', 'Elsewhere'].includes(label));

test('a highlight clip is a post card with the home crest and a playable video', async () => {
  const mount = await mountHighlights([clip()]);
  try {
    const { document } = mount;
    const card = document.querySelector('article')!;
    assert.ok(card.textContent.includes('Arsenal vs Chelsea'));

    // Author image = the home team crest, linking to the competition board.
    const crest = card.querySelector('img[src*="teamlogos"]')!;
    assert.equal(crest.getAttribute('src'), 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png');
    assert.match(crest.className, /w-10 h-10 rounded-full object-cover ring-1/);
    assert.equal(crest.closest('a')!.getAttribute('href'), '/sports?league=epl');

    // Fixture name, competition and state.
    assert.match(card.textContent, /Arsenal vs Chelsea/);
    assert.match(card.textContent, /Premier League · Full time/);
    assert.match(card.textContent, /Saka opens the scoring — A curled finish/);

    // The media is the site's own play card, with the clip as the source.
    const video = card.querySelector('video')!;
    assert.equal(video.getAttribute('src'), 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4');
    assert.equal(video.getAttribute('poster'), 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    assert.equal(video.getAttribute('controls'), '');
    // A board of cards must not pull a dozen streams on page load.
    assert.equal(video.getAttribute('preload'), 'none');
    assert.match(video.className, /block w-full max-h-\[min\(70vh,520px\)\] object-contain bg-black/);
    assert.match(video.closest('div')!.className, /rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200/);
    // Highlight cards omit the provider name and external "Open original" footer.
    assert.ok(!card.textContent.includes('ESPN'));
    assert.equal([...card.querySelectorAll('a')].find((node: any) => node.textContent.includes('Open original')), undefined);

    // Clip details below the video.
    assert.deepEqual([...card.querySelectorAll('dt')].map((node: any) => node.textContent), ['Length', 'Competition', 'State']);
    assert.deepEqual([...card.querySelectorAll('dd')].map((node: any) => node.textContent), ['0:47', 'Premier League', 'Full time']);

    // The card is clickable, and it stays on Hyper: no card-wide link leaves
    // the site for ESPN.
    const cardLink = card.querySelector('a.absolute.inset-0')!;
    assert.equal(cardLink.getAttribute('href'), '/sports?league=epl');
    assert.ok(![...card.querySelectorAll('a')].some((node: any) => (node.getAttribute('href') ?? '').startsWith('http') && !node.getAttribute('target')));
    assert.ok(findButton(document, 'Like Saka opens the scoring'));
    assert.ok(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.ok(findButton(document, 'Share Arsenal vs Chelsea'));
  } finally {
    mount.unmount();
  }
});

test('a highlight card reads its saved thread and posts through form actions', async () => {
  const clips = [clip()];
  const key = await highlightKeyFor(clips);
  const mount = await mountHighlights(clips, 'live', { engagement: engagementFixture(key, { postId: 91, likesCount: 12, commentsCount: 4, viewerLiked: false, viewerSaved: true }), signedIn: true });
  try {
    const { document, click, submit, type } = mount;
    const card = document.querySelector('article')!;

    // Counts come from the saved post, so a reload shows the same numbers.
    assert.equal(card.querySelector('.font-semibold.text-gray-700').textContent.trim(), '12 cheers');
    assert.equal(card.querySelector('.hover\\:underline.cursor-pointer').textContent.trim(), '4 comments');

    // Like and Save are server actions: submit buttons, never local toggles.
    const like = findButton(document, 'Like Saka opens the scoring');
    assert.equal(like.getAttribute('type'), 'submit');
    assert.equal(like.disabled, false);
    assert.equal(like.getAttribute('aria-pressed'), 'false');
    await submit(like.closest('form'));
    const save = findButton(document, 'Remove Arsenal vs Chelsea from saved');
    assert.equal(save.getAttribute('aria-pressed'), 'true', 'this viewer saved the clip');
    await submit(save.closest('form'));

    // The composer writes into the shared thread, and the thread names its authors.
    await click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /Historic season/);
    const composer = card.querySelector('form input[name="content"]')!;
    await type(composer, 'What a finish');
    await submit(composer.closest('form'));

    // Sharing opens the share sheet a profile opens: feed, groups, a message, elsewhere.
    assert.equal(shareSheet(document), null);
    await click(findButton(document, 'Share Arsenal vs Chelsea'));
    const sheet = shareSheet(document);
    assert.ok(sheet, 'the sheet is a dialog');
    assert.equal(sheet.querySelector('h2').textContent.trim(), 'Share highlight');
    assert.deepEqual(sheetTabs(sheet), ['Feed', 'Groups', 'Send to', 'Elsewhere']);
    assert.match(sheet.textContent, /Arsenal vs Chelsea/);
    assert.match(sheet.textContent, /Share to your feed/);
    assert.match(sheet.textContent, /Reposts this card to your followers/);
    const link = sheet.querySelector('input[aria-label="Highlight link"]');
    assert.match(link.value, /^https:\/\/hyper\.co\.ke\/sports\/highlights\//, 'the link is the clip\u2019s own page, with this site\u2019s origin');
    assert.equal(card.querySelector('form input[name="note"]'), null, 'the card\u2019s own share menu is gone');
    await click(findButton(document, 'Close share dialog'));
    assert.equal(shareSheet(document), null);
    assert.ok(!card.textContent.includes('ESPN'));

    // And the more menu links to the post every reader shares.
    await click(findButton(document, 'More options'));
    const discussion = [...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Open discussion')!;
    assert.equal(discussion.getAttribute('href'), '/post/91');
  } finally {
    mount.unmount();
  }
});

test('a highlight card stays read-only for a guest and for a sample board', async () => {
  // Signed out: the controls are all there, none of them pretend to save.
  const mount = await mountHighlights([clip()]);
  try {
    const { document, click } = mount;
    const card = document.querySelector('article')!;
    assert.equal(findButton(document, 'Like Saka opens the scoring').disabled, true);
    assert.equal(findButton(document, 'Save Arsenal vs Chelsea').disabled, true);
    assert.equal(card.querySelectorAll('form').length, 0, 'nothing to submit while signed out');
    await click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /Sign in to like, comment on and save this card, or to share it on Hyper\./);
  } finally {
    mount.unmount();
  }

  // Signed in, but ESPN is unreachable: sample clips get no anchor post.
  const sampleMount = await mountHighlights([clip()], 'unavailable', { signedIn: true });
  try {
    const { document, click } = sampleMount;
    const card = document.querySelector('article')!;
    assert.equal(card.querySelectorAll('form').length, 0, 'a sample card has no anchor post');
    await click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /Comments open when this card has a live feed behind it\./);
  } finally {
    sampleMount.unmount();
  }
});

test('a clip with no media file shows its thumbnail instead of pretending to play', async () => {
  const mount = await mountHighlights([clip({ mp4: null, playable: false, hls: 'https://cdn.example.espn.com/video/77/master.m3u8' })]);
  try {
    const { document } = mount;
    const card = document.querySelector('article')!;
    assert.equal(card.querySelector('video'), null);
    // The thumbnail still shows, with a readable caption inside the image.
    const poster = card.querySelector('img[src*="espncdn.com/media"]')!;
    assert.equal(poster.getAttribute('src'), 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    // The card says so under the composer, rather than failing silently.
    await mount.click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /This clip cannot play here right now\./);
  } finally {
    mount.unmount();
  }
});

test('a clip ESPN refuses to serve falls back to its thumbnail, not a dead player', async () => {
  const mount = await mountHighlights([clip()]);
  try {
    const { document } = mount;
    const card = document.querySelector('article')!;
    // ESPN's renditions are geo-restricted per competition, so the file itself
    // can fail; the card must not be left as the only clickable thing.
    const video = card.querySelector('video')!;
    const React = await import('react');
    const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
    await act(async () => { video.dispatchEvent(new mount.window.Event('error', { bubbles: true })); });

    assert.equal(card.querySelector('video'), null, 'the player is gone');
    assert.equal(card.querySelector('img[src*="espncdn.com/media"]')!.getAttribute('src'), 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    // The card says so under the composer, rather than failing silently.
    await mount.click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /This clip cannot play here right now\./);
    assert.equal(card.querySelector('a.absolute.inset-0')!.getAttribute('href'), '/sports?league=epl');
  } finally {
    mount.unmount();
  }
});

test('the sample board says the highlights are unreachable and offers more clips', async () => {
  const mount = await mountHighlights([
    clip(),
    clip({ id: '2', title: 'Second clip', eventName: 'Liverpool vs Everton' }),
    clip({ id: '3', title: 'Third clip', eventName: 'Real Madrid vs Barcelona' }),
    clip({ id: '4', title: 'Fourth clip', eventName: 'Bayern vs Dortmund' }),
    clip({ id: '5', title: 'Fifth clip', eventName: 'Juventus vs Milan' }),
  ], 'unavailable');
  try {
    const { document, click } = mount;
    const section = document.querySelector('section')!;
    assert.match(section.textContent, /Sample cards · highlight videos are unreachable right now/);
    // Four cards at a time, with the rest behind one control.
    assert.equal(document.querySelectorAll('article').length, 4);
    const more = [...document.querySelectorAll('button')].find((node: any) => node.textContent.includes('Show all'))!;
    await click(more);
    assert.equal(document.querySelectorAll('article').length, 5);
    assert.equal(document.querySelectorAll('video').length, 5);
    // Every card fits its column, at phone width.
    for (const article of document.querySelectorAll('article')) {
      assert.ok(article.scrollWidth <= article.clientWidth + 1, `${article.textContent.slice(0, 24)} overflows`);
    }
  } finally {
    mount.unmount();
  }
});

test('the desktop row holds every clip, and only the stacked form keeps four behind a control', async () => {
  const six = [
    clip(),
    clip({ id: '2', title: 'Second clip', eventName: 'Liverpool vs Everton' }),
    clip({ id: '3', title: 'Third clip', eventName: 'Real Madrid vs Barcelona' }),
    clip({ id: '4', title: 'Fourth clip', eventName: 'Bayern vs Dortmund' }),
    clip({ id: '5', title: 'Fifth clip', eventName: 'Juventus vs Milan' }),
    clip({ id: '6', title: 'Sixth clip', eventName: 'Ajax vs PSV' }),
  ];
  const mount = await mountHighlights(six, 'live', { layout: 'row' });
  try {
    const { document, click } = mount;
    const section = [...document.querySelectorAll('section')].find((node: any) => node.getAttribute('aria-label') === 'Match highlights')!;
    const cards = [...section.querySelectorAll('article')] as any[];
    // The row scrolls sideways, so nothing is withheld from it.
    assert.equal(cards.length, 6, 'every clip is in the row');
    // jsdom applies no stylesheet, so what is checked is the class that decides
    // it: `hidden` with `lg:flex` is "not on a phone, shown in the desktop row".
    const slot = (card: any) => card.parentElement as any;
    const held = cards.filter((card) => slot(card).classList.contains('hidden'));
    assert.deepEqual(held.map((card) => cards.indexOf(card)), [4, 5], 'the stacked form still shows four');
    for (const card of held) assert.ok(slot(card).classList.contains('lg:flex'), 'and the desktop row shows them all');

    const toggle = [...section.querySelectorAll('button')].find((node: any) => node.textContent.includes('Show all 6 highlights')) as any;
    assert.ok(toggle, 'the stacked form keeps its control');
    assert.ok(toggle.classList.contains('lg:hidden'), 'which the desktop row does not show');

    await click(toggle);
    assert.equal(cards.filter((card) => slot(card).classList.contains('hidden')).length, 0, 'pressing it on a phone shows the rest');
  } finally {
    await mount.unmount();
  }
});
