import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metadata as nba } from '../../src/app/sports/nba/page';
import { metadata as nfl } from '../../src/app/sports/nfl/page';
import { getSiteUrl } from '../../src/lib/site-url';

test('NBA and NFL pages have distinct canonical URLs and league-specific sharing metadata', () => {
  for (const [key, metadata] of [['nba', nba], ['nfl', nfl]] as const) {
    const url = `${getSiteUrl()}/sports/${key}`;
    assert.equal(metadata.title, key.toUpperCase());
    assert.equal(metadata.alternates?.canonical, url); assert.equal(metadata.openGraph?.url, url);
    assert.match(metadata.description!, new RegExp(key, 'i'));
    assert.ok(metadata.twitter);
  }
});
