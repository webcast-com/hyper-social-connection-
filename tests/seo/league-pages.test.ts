import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metadata as nba } from '../../src/app/sports/nba/page';
import { metadata as nfl } from '../../src/app/sports/nfl/page';
import { SPORTS_LEAGUE_PAGES } from '../../src/lib/sports-league-pages';
import { getSiteUrl } from '../../src/lib/site-url';

test('NBA and NFL pages keep serving, but canonicalise to the dashboard route that owns them', () => {
  for (const [key, metadata] of [['nba', nba], ['nfl', nfl]] as const) {
    const page = SPORTS_LEAGUE_PAGES[key];
    const url = `${getSiteUrl()}/sports/${key}`;
    assert.equal(metadata.title, key.toUpperCase());
    // The route is not indexed; the dashboard URL is the indexable equivalent.
    const robots = metadata.robots as { index: boolean; follow: boolean };
    assert.equal(robots.index, false);
    assert.equal(robots.follow, true);
    assert.equal(metadata.alternates?.canonical, getSiteUrl() + page.dashboardPath);
    // Sharing still points at the URL that was opened.
    assert.equal(metadata.openGraph?.url, url);
    assert.match(metadata.description!, new RegExp(key, 'i'));
    assert.ok(metadata.description!.includes('dashboard'));
    assert.ok(metadata.twitter);
  }
  assert.equal(nba.alternates?.canonical, `${getSiteUrl()}/nfl-basketball/basketball`);
  assert.equal(nfl.alternates?.canonical, `${getSiteUrl()}/nfl-basketball/nfl`);
});
