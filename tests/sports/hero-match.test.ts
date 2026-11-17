import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_BACKDROPS, heroBackdrop, heroFootnote, heroStatus } from '../../src/lib/hero-match';

const root = join(__dirname, '..', '..');

test('each sport gets the dashboard photograph that shows it', () => {
  assert.equal(heroBackdrop({ sport: 'basketball' }), '/sports/hero-basketball.webp');
  assert.equal(heroBackdrop({ sport: 'american-football' }), '/sports/hero-football.webp');
});

test('association football and every other sport get the stands, never the quarterback', () => {
  for (const sport of ['football', 'rugby', 'tennis', 'motorsport', 'baseball', 'ice-hockey', 'other'] as const) {
    assert.equal(heroBackdrop({ sport }), '/sports/hero-stadium.webp', sport);
  }
});

test('every backdrop the hero can ask for is a file the site serves', () => {
  for (const path of Object.values(HERO_BACKDROPS)) {
    assert.ok(existsSync(join(root, 'public', path)), `${path} exists under public/`);
  }
});

test('a sample fixture is labelled a sample and is never live, whatever status it was invented with', () => {
  for (const status of ['live', 'final', 'upcoming'] as const) {
    assert.deepEqual(heroStatus({ source: 'demo', status }), { label: 'Sample', live: false });
    assert.equal(heroFootnote({ source: 'demo' }, { label: "54'", tone: 'live' }, 'Today · 19:30'), 'Sample data');
  }
});

test('a reported fixture reads Live, Final or Upcoming, and only the first is live', () => {
  assert.deepEqual(heroStatus({ source: 'espn', status: 'live' }), { label: 'Live', live: true });
  assert.deepEqual(heroStatus({ source: 'espn', status: 'final' }), { label: 'Final', live: false });
  assert.deepEqual(heroStatus({ source: 'espn', status: 'upcoming' }), { label: 'Upcoming', live: false });
});

test('the footnote follows the dashboard: clock in progress, full time, or the kickoff', () => {
  const espn = { source: 'espn' as const };
  assert.equal(heroFootnote(espn, { label: "67'", tone: 'live' }, null), "67' · in progress");
  assert.equal(heroFootnote(espn, { label: 'Live', tone: 'live' }, null), 'In progress');
  assert.equal(heroFootnote(espn, { label: 'Final', tone: 'final' }, null), 'Full time');
  assert.equal(heroFootnote(espn, { label: 'Today · 19:30', tone: 'soon' }, 'Today · 19:30'), 'Kick-off Today · 19:30');
});

test('no kickoff time is claimed before the viewer’s time zone is known', () => {
  assert.equal(heroFootnote({ source: 'espn' }, { label: 'Today · 16:30', tone: 'soon' }, null), 'Not started');
});

test('the match centre draws its first fixture as the hero and keeps the rest as rows', () => {
  const centre = readFileSync(join(root, 'src/components/SportsMatchCentre.tsx'), 'utf8');
  assert.match(centre, /<SportsHeroMatch event=\{rows\[0\]\}/);
  assert.match(centre, /rows\.slice\(1\)\.map/);
  assert.match(centre, /aria-label="Sports scores"/);
  assert.match(centre, /All competitions/);
});
