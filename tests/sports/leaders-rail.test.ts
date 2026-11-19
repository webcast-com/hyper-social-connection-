import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardsFor, mountBoard } from './leaders-post-cards';
import type { SportsLeaderBoard } from '../../src/lib/espn-leaders';

/**
 * Players & top scorers as a homepage rail list.
 *
 * The left rail carries the NFL list and the right rail the basketball one.
 * Each is one sport's board as a compact list: one line per statistic leader,
 * linking to the player, with the value ESPN reported. Like the board in the
 * feed column it shows only what ESPN reported, so an empty board is no list.
 */

async function mountRail(board: SportsLeaderBoard | undefined, className?: string) {
  const empty = { sport: 'basketball', league: 'nba', rows: [], status: 'live', source: { ok: true, url: '', httpStatus: 200 } };
  const mounted = await mountBoard({ basketball: empty, football: empty });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const SportsLeadersRail = (await import('../../src/components/SportsLeadersRail')).default;
  const act = (React as unknown as { act: (fn: () => Promise<void> | void) => Promise<void> }).act;
  const container = mounted.document.createElement('div');
  mounted.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SportsLeadersRail as never, { board, className } as never)); });
  return {
    container,
    window: mounted.window,
    act,
    unmount: async () => { await act(() => root.unmount()); container.remove(); await mounted.unmount(); },
  };
}

const boards = async () => (await boardsFor()) as unknown as Record<'basketball' | 'football', SportsLeaderBoard>;

test('the NFL list names its sport and lists each statistic leader with the value ESPN reported', async () => {
  const { football } = await boards();
  const view = await mountRail(football);
  try {
    const section = view.container.querySelector('section') as any;
    assert.equal(section.getAttribute('aria-label'), 'NFL players & top scorers');
    assert.match(section.querySelector('h3').textContent, /Players & top scorers\s*NFL/);
    assert.match(section.textContent, /NFL season leaders from ESPN/);

    const lines = [...section.querySelectorAll('li')] as any[];
    assert.equal(lines.length, football.rows.length);
    assert.match(lines[0].textContent, /Lamar Jackson/);
    assert.match(lines[0].textContent, /BAL · Passing Yards/);
    assert.match(lines[0].textContent, /3,678/);
    assert.match(lines[0].textContent, /PASS/);
    // The player is identified by ESPN's id, so the line opens the player's page.
    assert.equal(lines[0].querySelector('a').getAttribute('href'), '/sports/athletes/nfl/3916387');

    const dashboard = [...section.querySelectorAll('a')].find((link: any) => link.textContent.includes('dashboard')) as any;
    assert.equal(dashboard.getAttribute('href'), '/nfl-basketball/nfl');
    assert.match(dashboard.textContent, /NFL dashboard/);
  } finally {
    await view.unmount();
  }
});

test('the basketball list is the basketball board, one line per statistic', async () => {
  const { basketball } = await boards();
  const view = await mountRail(basketball);
  try {
    const section = view.container.querySelector('section') as any;
    assert.equal(section.getAttribute('aria-label'), 'Basketball players & top scorers');
    assert.match(section.querySelector('h3').textContent, /Players & top scorers\s*Basketball/);
    assert.match(section.textContent, /NBA season leaders from ESPN/);
    const lines = [...section.querySelectorAll('li')].map((line: any) => line.textContent);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /Luka Dončić.*DAL · Points Per Game.*33\.9.*PTS/);
    assert.match(lines[1], /Nikola Jokić.*DEN · Rebounds Per Game.*12\.4.*REB/);
    assert.equal(section.querySelector('li a').getAttribute('href'), '/sports/athletes/nba/3945274');
    assert.equal([...section.querySelectorAll('a')].at(-1).getAttribute('href'), '/nfl-basketball/basketball');
  } finally {
    await view.unmount();
  }
});

test('a photo that fails to load falls back to the player\'s initials, and the line stays', async () => {
  const { basketball } = await boards();
  const view = await mountRail(basketball);
  try {
    const line = view.container.querySelector('li') as any;
    const image = line.querySelector('img');
    assert.ok(image, 'the ESPN headshot is shown first');
    assert.equal(image.getAttribute('alt'), '', 'the name is beside it, so the photo is decorative');
    await view.act(async () => { image.dispatchEvent(new view.window.Event('error')); });
    assert.equal(line.querySelector('img'), null);
    assert.match(line.textContent, /LD/);
    assert.match(line.textContent, /Luka Dončić/);
  } finally {
    await view.unmount();
  }
});

test('a board ESPN did not answer renders no list at all', async () => {
  const { football } = await boards();
  for (const board of [undefined, { ...football, rows: [], status: 'unavailable' as const }]) {
    const view = await mountRail(board);
    try {
      assert.equal(view.container.querySelector('section'), null, 'no heading over an empty list, and no sample players');
      assert.equal(view.container.textContent, '');
    } finally {
      await view.unmount();
    }
  }
});

test('the caller\'s class reaches the section, which is how the page shows a list at some widths only', async () => {
  const { football } = await boards();
  const view = await mountRail(football, 'xl:hidden');
  try {
    assert.ok((view.container.querySelector('section') as any).classList.contains('xl:hidden'));
  } finally {
    await view.unmount();
  }
});

test('the homepage puts NFL under the groups in the left rail and basketball under Contacts in the right', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
  const at = (needle: string, from = 0) => {
    const index = source.indexOf(needle, from);
    assert.notEqual(index, -1, `${needle} is in the page`);
    return index;
  };
  // Left rail: the groups list (whose last link reads "Find groups to join" for
  // someone in no group), then the NFL list, then the rail closes.
  const groups = at("'Find groups to join'");
  const nfl = at('<SportsLeadersRail board={leaderBoards.football} />', groups);
  const leftEnds = at('</aside>', groups);
  assert.ok(nfl < leftEnds, 'the NFL list is inside the left rail, after the groups');

  // Right rail: Contacts, then the basketball list.
  const contacts = at('>Contacts</h3>', leftEnds);
  const basketball = at('<SportsLeadersRail board={leaderBoards.basketball} />', contacts);
  assert.ok(basketball < at('</aside>', contacts), 'the basketball list is inside the right rail, after Contacts');
  // With no left rail between lg and xl, the NFL list moves here rather than vanish.
  assert.ok(at('<SportsLeadersRail board={leaderBoards.football} className="xl:hidden" />', basketball) < at('</aside>', contacts));
});
