import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBoard, findButton } from './leaders-post-cards';
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

async function mountHighlights(clips: unknown[], status?: SportsHighlightsBoard['status']) {
  const React = await import('react');
  const { act } = React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> };
  // An empty leaders board keeps the shared document clean for this section.
  const mounted = await mountBoard({ basketball: { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } }, football: { sport: 'football', league: 'nfl', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } } });
  const SportsHighlightsFeed = (await import('../../src/components/SportsHighlightsFeed')).default;
  const { createRoot } = await import('react-dom/client');
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SportsHighlightsFeed as never, { board: board(clips, status) } as never)); });
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

    // The media is the feed's own post video block, with the clip as the source.
    const video = card.querySelector('video')!;
    assert.equal(video.getAttribute('src'), 'https://a.espncdn.com/media/video/2026/0907/49861382_3600k.mp4');
    assert.equal(video.getAttribute('poster'), 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    assert.equal(video.getAttribute('controls'), '');
    assert.equal(video.getAttribute('preload'), 'none');
    assert.match(video.className, /block w-full max-h-\[min\(70vh,520px\)\] object-contain bg-black/);
    assert.match(video.closest('div')!.className, /relative z-10 bg-black w-full min-w-0 overflow-hidden/);

    // Clip details below the video.
    assert.deepEqual([...card.querySelectorAll('dt')].map((node: any) => node.textContent), ['Length', 'Competition', 'State']);
    assert.deepEqual([...card.querySelectorAll('dd')].map((node: any) => node.textContent), ['0:47', 'Premier League', 'Full time']);

    // The card is clickable and keeps the post actions.
    assert.equal(card.querySelector('a.absolute.inset-0')!.getAttribute('href'), 'https://www.espn.com/video/clip/_/id/49861382');
    assert.ok(findButton(document, 'Like Saka opens the scoring'));
    assert.ok(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.ok(findButton(document, 'Share Arsenal vs Chelsea'));
  } finally {
    mount.unmount();
  }
});

test('Like, Comment and Share work on a highlight card', async () => {
  const mount = await mountHighlights([clip()]);
  try {
    const { document, click, type } = mount;
    const card = document.querySelector('article')!;
    const cheerCount = () => card.querySelector('.font-semibold.text-gray-700').textContent.trim();

    assert.equal(cheerCount(), '0 cheers');
    await click(findButton(document, 'Like Saka opens the scoring'));
    assert.equal(cheerCount(), '1 cheer');

    await click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    await type(card.querySelector('input[type="text"]')!, 'What a finish');
    await click([...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Post')!);
    assert.match(card.textContent, /What a finish/);
    assert.equal(card.querySelector('.hover\\:underline.cursor-pointer').textContent.trim(), '1 comment');

    await click(findButton(document, 'Share Arsenal vs Chelsea'));
    assert.match(card.textContent, /Copy Link/);
    assert.match(card.textContent, /Highlights are ESPN clips\. Comments stay in this browser\./);
  } finally {
    mount.unmount();
  }
});

test('a clip with no media file links out instead of pretending to play', async () => {
  const mount = await mountHighlights([clip({ mp4: null, playable: false, hls: 'https://cdn.example.espn.com/video/77/master.m3u8' })]);
  try {
    const { document, click } = mount;
    const card = document.querySelector('article')!;
    assert.equal(card.querySelector('video'), null);
    const play = card.querySelector('a[aria-label^="Watch"]')!;
    assert.equal(play.getAttribute('aria-label'), 'Watch Saka opens the scoring on ESPN');
    assert.equal(play.getAttribute('href'), 'https://www.espn.com/video/clip/_/id/49861382');
    // The thumbnail still shows, with a readable caption inside the image.
    const poster = card.querySelector('img[src*="espncdn.com/media"]')!;
    assert.equal(poster.getAttribute('src'), 'https://a.espncdn.com/media/2026/0907/49861382.jpg');
    // The card says so under the composer, rather than failing silently.
    await mount.click(findButton(document, 'Comment on Arsenal vs Chelsea'));
    assert.match(card.textContent, /This clip cannot play inline/);
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
    assert.match(section.textContent, /Sample cards · ESPN highlight videos are unreachable right now/);
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
