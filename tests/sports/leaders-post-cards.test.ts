import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardsFor, mountBoard, findButton } from './leaders-post-cards';

/**
 * The homepage players board as posts: crest for the author image, player name,
 * the post media block with a readable caption, player details below the image,
 * and a working Like / Comment / Share row.
 */

test('a player card uses the post card layout with the team crest as the author image', async () => {
  const mount = await mountBoard(await boardsFor());
  try {
    const { document } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    assert.ok(card, 'the Luka Dončić card renders');

    // The card is the feed's post card, not the dashboard's player card.
    assert.match(card.className, /bg-white dark:bg-gray-800 rounded-xl shadow border/);
    assert.equal(card.querySelectorAll('.sh-player').length, 0);

    // Author image = the team crest, linked to the team page.
    const crest = card.querySelector('img[src*="teamlogos"]')!;
    assert.equal(crest.getAttribute('src'), 'https://a.espncdn.com/i/teamlogos/nba/500/dal.png');
    assert.match(crest.className, /w-10 h-10 rounded-full object-cover ring-1/);
    const teamLink = crest.closest('a')!;
    assert.equal(teamLink.getAttribute('href'), '/nfl-basketball/basketball/team/dallas-mavericks');

    // Player name next to it, with the position, team and metric underneath.
    const name = [...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Luka Dončić')!;
    assert.equal(name.getAttribute('href'), '/nfl-basketball/basketball/player/luka-doncic');
    assert.match(name.className, /font-bold text-gray-900 dark:text-white hover:underline text-sm truncate block/);
    assert.match(card.textContent, /PG · DAL · Points Per Game/);

    // Media uses the post image block, and the caption is readable inside it.
    const media = card.querySelector('img.w-full')!;
    assert.match(media.className, /object-contain max-h-\[520px\] transition-transform duration-300 group-hover:scale-\[1\.01\]/);
    assert.equal(media.getAttribute('src'), 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png');
    const caption = card.querySelector('.pointer-events-none.absolute')!;
    assert.match(caption.className, /from-black\/85/);
    assert.equal(caption.textContent, 'Luka DončićDallas Mavericks · PTS 33.9');

    // Player details sit below the image.
    const details = [...card.querySelectorAll('dl > div')];
    assert.deepEqual(details.map((node: any) => node.querySelector('dt').textContent), ['Team', 'Stat', 'Value']);
    assert.deepEqual(details.map((node: any) => node.querySelector('dd').textContent), ['DAL', 'PTS', '33.9']);

    // The card itself is clickable, with the controls above the link.
    const overlay = card.querySelector('a.absolute.inset-0')!;
    assert.equal(overlay.getAttribute('href'), '/nfl-basketball/basketball/player/luka-doncic');
    assert.match(overlay.className, /absolute inset-0 z-0/);
    // The controls sit above the card-wide link, so they keep their behaviour.
    assert.match(card.querySelector('.group.cursor-pointer').className, /relative z-10/);
  } finally {
    mount.unmount();
  }
});

test('Like, Comment, Share and save all work on a player card', async () => {
  const mount = await mountBoard(await boardsFor());
  try {
    const { document, click, type } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    const cheerCount = () => card.querySelector('.font-semibold.text-gray-700').textContent.trim();

    assert.equal(cheerCount(), '0 cheers');
    const like = findButton(document, 'Like Luka Dončić');
    await click(like);
    assert.equal(like.getAttribute('aria-pressed'), 'true');
    assert.equal(cheerCount(), '1 cheer');
    await click(like);
    assert.equal(like.getAttribute('aria-pressed'), 'false');
    assert.equal(cheerCount(), '0 cheers');

    // Comment opens the composer and posts the comment into the thread.
    await click(findButton(document, 'Comment on Luka Dončić'));
    const input = card.querySelector('input[type="text"]')!;
    assert.ok(input, 'the comment composer opens');
    await type(input, 'What a season');
    await click([...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Post')!);
    assert.match(card.textContent, /What a season/);
    assert.equal(card.querySelector('.hover\\:underline.cursor-pointer').textContent.trim(), '1 comment');
    // The card is honest about where a comment lives.
    assert.match(card.textContent, /Comments stay in this browser/);

    // Share opens a menu that can copy the player link.
    await click(findButton(document, 'Share Luka Dončić'));
    assert.match(card.textContent, /Copy Link/);
    assert.match(card.textContent, /Open Player Profile/);
    await click([...card.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'Close')!);
    assert.doesNotMatch(card.textContent, /Copy Link/);

    // Save toggles like a post bookmark.
    const save = findButton(document, 'Save Luka Dončić');
    await click(save);
    assert.equal(save.getAttribute('aria-pressed'), 'true');
    assert.equal(findButton(document, 'Remove Luka Dončić from saved players').getAttribute('aria-pressed'), 'true');
  } finally {
    mount.unmount();
  }
});

test('the card image opens the post lightbox and the NFL tab swaps the whole board', async () => {
  const mount = await mountBoard(await boardsFor());
  try {
    const { document, click } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    await click(card.querySelector('img.w-full').closest('div')!);
    assert.ok(document.querySelector('.fixed.inset-0'), 'the lightbox opens over the card');

    await click([...document.querySelectorAll('button')].find((node: any) => node.textContent.trim() === 'NFL')!);
    const nfl = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Lamar Jackson'))!;
    assert.equal(nfl.querySelector('img[src*="teamlogos"]').getAttribute('src'), 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png');
    assert.equal(nfl.querySelector('img.w-full').getAttribute('src'), 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png');
    assert.match(nfl.textContent, /QB · BAL · Passing Yards/);
    assert.equal(nfl.querySelector('a.absolute.inset-0').getAttribute('href'), '/nfl-basketball/nfl/player/lamar-jackson');
    assert.match(document.body.textContent, /NFL season leaders from ESPN/);
  } finally {
    mount.unmount();
  }
});

test('the more menu reaches the player profile and every card fits its column', async () => {
  const mount = await mountBoard(await boardsFor());
  try {
    const { document, click } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    await click(findButton(document, 'More player options'));
    assert.ok([...card.querySelectorAll('a')].some((node: any) => node.textContent.trim() === 'Open Player Profile'));

    // A post card must not overflow the column it sits in, at phone width.
    for (const article of document.querySelectorAll('article')) {
      assert.ok(article.scrollWidth <= article.clientWidth + 1, `${article.textContent.slice(0, 24)} overflows`);
    }
  } finally {
    mount.unmount();
  }
});
