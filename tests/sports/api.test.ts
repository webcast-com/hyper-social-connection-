import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/route';
import { SPORTS_BOARD_LEAGUES } from '../../src/lib/sports-catalog';

test('manual sports refresh bypasses provider and response caches, normal responses retain short caching', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ events: [] }); };
  try {
    const fresh = await GET(new NextRequest('https://hyper.test/api/sports?refresh=1'));
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get('Cache-Control'), 'no-store');
    assert.equal((await fresh.json()).mode, 'live');
    const afterFresh = requests;
    assert.ok(afterFresh > 0);
    const cached = await GET(new NextRequest('https://hyper.test/api/sports'));
    assert.match(cached.headers.get('Cache-Control') || '', /max-age=20/);
    assert.equal(requests, afterFresh);
    await GET(new NextRequest('https://hyper.test/api/sports?refresh=1'));
    assert.equal(requests, 2 * afterFresh);
  } finally {
    globalThis.fetch = original;
  }
});

test('a leagues subset re-requests only the named competitions, and unknown names cannot widen it', async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => { requested.push(String(input)); return Response.json({ events: [] }); };
  try {
    const subset = await GET(new NextRequest('https://hyper.test/api/sports?leagues=zambia,zimbabwe,neverland,zambia'));
    assert.equal(subset.status, 200);
    const board = await subset.json();
    assert.equal(board.mode, 'live');
    assert.deepEqual(board.sources.map((source: { id: string }) => source.id).sort(), ['espn:zambia', 'espn:zimbabwe']);
    assert.equal(requested.length, 2);
    assert.ok(requested.every((url) => url.includes('zam.1') || url.includes('zim.1')));
    // Nothing valid remains: the whole catalog is used, exactly as without the parameter.
    requested.length = 0;
    await GET(new NextRequest('https://hyper.test/api/sports?leagues=neverland&refresh=1'));
    assert.equal(requested.length, SPORTS_BOARD_LEAGUES.length);
  } finally {
    globalThis.fetch = original;
  }
});
