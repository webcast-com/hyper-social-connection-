/**
 * Which `/profile/{id}`, `/groups/{id}` and `/post/{id}` addresses name a record at
 * all.
 *
 * The rule is small, but it is the difference between a URL that renders the thing it
 * names and one that renders whatever a loose parse happened to land on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIdFromParam } from '../../src/lib/route-id';

test('an id written as a positive integer names that record', () => {
  assert.equal(routeIdFromParam('1'), 1);
  assert.equal(routeIdFromParam('7'), 7);
  assert.equal(routeIdFromParam('424242'), 424242);
  // No upper bound below the one JavaScript can hold exactly.
  assert.equal(routeIdFromParam(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test('anything else names nobody, and is not guessed at', () => {
  for (const param of [
    'abc',        // not a number
    '12abc',      // starts as one — the old parse read this as member 12
    'abc12',
    '1.5',        // not an id this database can hold
    '1e3',       // exponential: Number() reads this as 1000
    '0x10',      // hexadecimal: Number() reads this as 16
    '0',          // ids start at 1
    '-5',
    '+5',
    '',
    '   ',
    ' 1',         // padded: a URL that is not exactly an id is not an id
    '1 ',
    '1,000',
    '9999999999999999999999', // past a safe integer; refused rather than wrapped
  ]) {
    assert.equal(routeIdFromParam(param), null, JSON.stringify(param));
  }
});

test('no parameter at all names nobody', () => {
  assert.equal(routeIdFromParam(null), null);
  assert.equal(routeIdFromParam(undefined), null);
  assert.equal(routeIdFromParam(7 as unknown as string), null, 'a number is not a route parameter');
});
