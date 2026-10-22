import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/sports/route';

test('manual sports refresh bypasses provider and response caches, normal responses retain short caching', async () => {
  const original = globalThis.fetch;
  const key = process.env.RAPIDAPI_KEY;
  delete process.env.RAPIDAPI_KEY;
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
    if (key === undefined) delete process.env.RAPIDAPI_KEY; else process.env.RAPIDAPI_KEY = key;
  }
});
