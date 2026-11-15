import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardsFor, engagementFixture, leaderKeyFor, mountBoard, findButton } from './leaders-post-cards';

/**
 * The homepage players board as posts: crest for the author image, player name,
 * the post media block with a readable caption, player details below the image,
 * and a working Like / Comment / Share row.
 */

/** The share sheet is a dialog on the page, not part of the card. */
const shareSheet = (document: any) => document.querySelector('[role="dialog"][aria-labelledby="share-sheet-title"]');
const sheetTabs = (sheet: any) => [...sheet.querySelectorAll('button')]
  .map((button: any) => button.textContent.trim())
  .filter((label: string) => ['Feed', 'Groups', 'Send to', 'Elsewhere'].includes(label));

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
    assert.equal(teamLink.getAttribute('href'), '/nfl-basketball/basketball/team/dallas-mavericks',
      'a crest with no reported ESPN team id keeps the dashboard route');

    // Player name next to it, with the position, team and metric underneath.
    const name = [...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Luka Dončić')!;
    assert.equal(name.getAttribute('href'), '/sports/athletes/nba/3945274');
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
    assert.equal(overlay.getAttribute('href'), '/sports/athletes/nba/3945274');
    assert.match(overlay.className, /absolute inset-0 z-0/);
    // The controls sit above the card-wide link, so they keep their behaviour.
    assert.match(card.querySelector('.group.cursor-pointer').className, /relative z-10/);
  } finally {
    mount.unmount();
  }
});

test('a signed-in member sees the card\u2019s saved engagement and acts through form actions', async () => {
  const boards = await boardsFor();
  const key = await leaderKeyFor(boards, 'basketball');
  const mount = await mountBoard(boards, { engagement: engagementFixture(key), signedIn: true });
  try {
    const { document, click, submit, type } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Don\u010di\u0107'))!;

    // The count comes from the saved post, not from state a reload would erase.
    assert.equal(card.querySelector('.font-semibold.text-gray-700').textContent.trim(), '3 cheers');

    // Like is a form action, shown as pressed because this viewer liked it.
    const like = findButton(document, 'Like Luka Don\u010di\u0107');
    assert.equal(like.getAttribute('type'), 'submit');
    assert.equal(like.disabled, false);
    assert.equal(like.getAttribute('aria-pressed'), 'true');
    const likeForm = like.closest('form')!;
    assert.equal(likeForm, card.querySelector('form'));
    await submit(likeForm);

    // The saved thread renders with its authors, and the composer posts into it.
    await click(findButton(document, 'Comment on Luka Don\u010di\u0107'));
    assert.match(card.textContent, /Historic season/);
    assert.match(card.textContent, /Maya Patel/);
    assert.match(card.textContent, /Likes and comments are saved to your account/);
    const composer = card.querySelector('form input[name="content"]')!;
    assert.ok(composer, 'the comment composer is a form action');
    await type(composer, 'What a season');
    await submit(composer.closest('form'));

    // Share opens the share sheet a profile opens: feed, groups, a message, elsewhere.
    await click(findButton(document, 'Share Luka Don\u010di\u0107'));
    const sheet = shareSheet(document);
    assert.ok(sheet, 'the sheet is a dialog');
    assert.equal(sheet.querySelector('h2').textContent.trim(), 'Share player');
    assert.deepEqual(sheetTabs(sheet), ['Feed', 'Groups', 'Send to', 'Elsewhere']);
    assert.match(sheet.textContent, /Luka Don\u010di\u0107/);
    assert.match(sheet.textContent, /Share to your feed/);
    assert.ok(sheet.querySelector('textarea'), 'with room for a note');
    assert.match(sheet.querySelector('input[aria-label="Player link"]').value, /^https:\/\/hyper\.co\.ke\//);
    assert.equal(card.querySelector('form input[name="note"]'), null, 'the card\u2019s own share menu is gone');
    await click(findButton(document, 'Close share dialog'));
    assert.equal(shareSheet(document), null);

    // Save is a form action, and the more menu reaches the discussion post, the
    // link and the lightbox the share menu used to carry.
    assert.equal(findButton(document, 'Save Luka Don\u010di\u0107').getAttribute('type'), 'submit');
    await click(findButton(document, 'More options'));
    assert.match(card.textContent, /Copy Link/);
    assert.match(card.textContent, /Expand Image/);
    const discussion = [...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Open discussion')!;
    assert.equal(discussion.getAttribute('href'), '/post/77');
  } finally {
    mount.unmount();
  }
});

test('a guest, or a board that is not a live ESPN answer, gets a read-only card that says why', async () => {
  // Signed out on a live board: every control is present, none of them fake a result.
  const boards = await boardsFor();
  const mount = await mountBoard(boards);
  try {
    const { document, click } = mount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Don\u010di\u0107'))!;
    assert.equal(findButton(document, 'Like Luka Don\u010di\u0107').disabled, true);
    assert.equal(findButton(document, 'Save Luka Don\u010di\u0107').disabled, true);
    assert.equal(card.querySelectorAll('form').length, 0, 'nothing to submit while signed out');
    await click(findButton(document, 'Comment on Luka Don\u010di\u0107'));
    assert.match(card.textContent, /Sign in to like, comment on and save this card, or to share it on Hyper\./);
    assert.match(card.textContent, /Sign in to join this conversation\./);
  } finally {
    mount.unmount();
  }

  // Signed in, but the board is not marked live. The feed no longer produces
  // rows for such a board — there is no bundled sample — so this is the guard
  // behind that: whatever the rows are, a board ESPN did not answer is never
  // anchored, and nothing is stored as though a member had posted it.
  const sample: any = await boardsFor();
  sample.basketball.status = 'unavailable';
  const sampleMount = await mountBoard(sample, { signedIn: true });
  try {
    const { document, click } = sampleMount;
    const card = [...document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Don\u010di\u0107'))!;
    assert.equal(findButton(document, 'Like Luka Don\u010di\u0107').disabled, true);
    assert.equal(card.querySelectorAll('form').length, 0, 'a card with no live feed behind it has no anchor post');
    await click(findButton(document, 'Comment on Luka Don\u010di\u0107'));
    assert.match(card.textContent, /Engagement is unavailable on sample cards/);
    assert.match(card.textContent, /Comments open when this card has a live feed behind it\./);
  } finally {
    sampleMount.unmount();
  }
});

test('a feed ESPN did not answer shows no players: the other sport opens, and nothing is invented', async () => {
  const unavailable = (sport: string, league: string) => ({
    sport, league, rows: [], status: 'unavailable',
    source: { ok: false, url: 'https://espn.test/leaders', httpStatus: 404, error: 'ESPN HTTP 404', errorKind: 'http' },
  });

  // Basketball failed, the NFL answered: the board opens on the NFL instead of
  // disappearing, and the basketball tab says what happened in plain words.
  const boards: any = await boardsFor();
  const nflName = boards.football.rows[0].name;
  boards.basketball = unavailable('basketball', 'nba');
  const mount = await mountBoard(boards);
  try {
    const { document, click } = mount;
    const sportButton = (label: string) => [...document.querySelectorAll('button')].find((node: any) => node.textContent.trim() === label)!;
    assert.equal(sportButton('NFL').getAttribute('aria-pressed'), 'true', 'the sport that answered is the one shown');
    assert.ok(document.querySelectorAll('article').length > 0);
    assert.match(document.body.textContent, new RegExp(nflName));
    assert.match(document.body.textContent, /NFL season leaders from ESPN/);

    await click(sportButton('Basketball'));
    assert.equal(document.querySelectorAll('article').length, 0, 'no card is rendered for a sport ESPN did not answer');
    assert.match(document.body.textContent, /ESPN did not return Basketball leaders just now\. No sample players are shown in their place\./);
    assert.doesNotMatch(document.body.textContent, /sample values/);
    assert.ok(sportButton('NFL'), 'the switch stays, so the board that did answer is one tap away');
  } finally {
    mount.unmount();
  }

  // Neither sport answered: no section, no heading, no placeholder players.
  const none = await mountBoard({ basketball: unavailable('basketball', 'nba'), football: unavailable('football', 'nfl') });
  try {
    assert.equal(none.document.querySelector('section[aria-label="Players & top scorers"]'), null);
    assert.equal(none.document.querySelectorAll('article').length, 0);
  } finally {
    none.unmount();
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
    assert.equal(nfl.querySelector('a.absolute.inset-0').getAttribute('href'), '/sports/athletes/nfl/3916387');
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
    await click(findButton(document, 'More options'));
    assert.ok([...card.querySelectorAll('a')].some((node: any) => node.textContent.trim() === 'Open Player Profile'));
    await mount.click(findButton(document, 'More options'));
    assert.doesNotMatch(card.textContent, /Open Player Profile/);

    // A post card must not overflow the column it sits in, at phone width.
    for (const article of document.querySelectorAll('article')) {
      assert.ok(article.scrollWidth <= article.clientWidth + 1, `${article.textContent.slice(0, 24)} overflows`);
    }
  } finally {
    mount.unmount();
  }
});

test('a card links to a native page only where ESPN reported an id', async () => {
  const boards: any = await boardsFor();
  // The bundled fixture reports an athlete id but no team id, so this adds the
  // team id the leaders payload carries in production.
  const withTeamId = {
    ...boards,
    basketball: {
      ...boards.basketball,
      rows: boards.basketball.rows.map((row: any, index: number) => (index === 0 ? { ...row, teamId: '1001' } : row)),
    },
  };

  const first = await mountBoard(withTeamId);
  let crestHref: string | null = null;
  let nameHref: string | null = null;
  try {
    const card = [...first.document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    crestHref = card.querySelector('img[src*="teamlogos"]')!.closest('a')!.getAttribute('href');
    nameHref = [...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Luka Dončić')!.getAttribute('href');
  } finally {
    await first.unmount();
  }
  assert.equal(crestHref, '/sports/teams/nba/1001', 'a reported team id links to that team’s own page');
  assert.equal(nameHref, '/sports/athletes/nba/3945274', 'a reported athlete id links to that player’s own page');

  // Without an id there is nothing to address a page by, so the card keeps the
  // dashboard route it has always used rather than guessing an entity from a name.
  const withoutIds = {
    ...withTeamId,
    basketball: {
      ...withTeamId.basketball,
      rows: withTeamId.basketball.rows.map((row: any, index: number) => (index === 0 ? { ...row, athleteId: null, teamId: null } : row)),
    },
  };
  const second = await mountBoard(withoutIds);
  try {
    const card = [...second.document.querySelectorAll('article')].find((node: any) => node.textContent.includes('Luka Dončić'))!;
    assert.equal(card.querySelector('img[src*="teamlogos"]')!.closest('a')!.getAttribute('href'), '/nfl-basketball/basketball/team/dallas-mavericks');
    assert.equal([...card.querySelectorAll('a')].find((node: any) => node.textContent.trim() === 'Luka Dončić')!.getAttribute('href'), '/nfl-basketball/basketball/player/luka-doncic');
  } finally {
    await second.unmount();
  }
});
