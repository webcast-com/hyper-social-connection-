import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditEspnScoreboards } from '../../src/lib/espn-audit';
import { ESPN_LEAGUES } from '../../src/lib/sports-catalog';

async function withFetch(respond: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = respond;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('the complete audit checks all sports, bounds concurrency and records true empty schedules as healthy', async () => {
  let active = 0, maximum = 0, calls = 0;
  await withFetch(async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--; return Response.json({ events: [] });
  }, async () => {
    const report = await auditEspnScoreboards();
    assert.equal(calls, 38);
    assert.ok(maximum > 1 && maximum <= 8);
    assert.equal(report.summary.healthy, 38);
    assert.equal(report.sports.length, 7);
    assert.deepEqual(report.sports.map((row) => row.checked), [28, 4, 1, 1, 1, 2, 1]);
    assert.ok(report.results.every((row) => row.httpStatus === 200 && row.events === 0 && row.live === 0));
  });
});
test('HTTP 404 for every sport records 38 unavailable routes without retrying or calling them empty schedules', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return new Response('', { status: 404 }); }, async () => {
    const report = await auditEspnScoreboards();
    assert.equal(calls, 38);
    assert.equal(report.summary.http404, 38);
    assert.equal(report.summary.networkFailures, 0);
    assert.ok(report.results.every((row) => !row.ok && row.httpStatus === 404 && row.errorKind === 'http' && row.events === null));
    assert.ok(report.sports.every((row) => row.http404 === row.checked && row.noHttpResponse === 0));
  });
});
test('connection resets and malformed HTTP 200 responses cannot be confused with 404s', async () => {
  await withFetch(async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } }); }, async () => {
    const report = await auditEspnScoreboards(ESPN_LEAGUES.filter((league) => league.slug === 'nba'));
    assert.equal(report.summary.http404, 0);
    assert.equal(report.summary.networkFailures, 1);
    assert.equal(report.results[0].httpStatus, null);
    assert.match(report.results[0].error || '', /ECONNRESET/);
  });
  await withFetch(async () => Response.json({ wrong: [] }), async () => {
    const report = await auditEspnScoreboards(ESPN_LEAGUES.filter((league) => league.slug === 'nfl'));
    assert.equal(report.summary.invalidResponses, 1);
    assert.equal(report.summary.http404, 0);
    assert.equal(report.results[0].httpStatus, 200);
    assert.equal(report.results[0].errorKind, 'invalid-response');
  });
});

test('all-sport HTTP 403 denials get distinct summary counts and retain metadata without retries', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++; return new Response('test-private-body', { status: 403, headers: { server: 'example-edge', 'content-type': 'text/plain' } });
  }, async () => {
    const report = await auditEspnScoreboards();
    assert.equal(calls, 38);
    assert.equal(report.summary.http403, 38);
    assert.equal(report.summary.http404, 0);
    assert.equal(report.summary.networkFailures, 0);
    assert.ok(report.sports.every((sport) => sport.http403 === sport.checked));
    assert.ok(report.results.every((row) => row.httpStatus === 403 && row.responseMetadata?.server === 'example-edge'));
    assert.ok(!JSON.stringify(report).includes('test-private-body'));
  });
});
