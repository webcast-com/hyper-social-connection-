/**
 * Which `/profile/{id}` addresses name a member at all.
 *
 * The rule is small, but it is the difference between a URL that renders the person
 * it names and one that renders whoever a loose parse happened to land on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileIdFromRouteParam } from '../../src/lib/profile';

test('an id written as a positive integer names that member', () => {
  assert.equal(profileIdFromRouteParam('1'), 1);
  assert.equal(profileIdFromRouteParam('7'), 7);
  assert.equal(profileIdFromRouteParam('424242'), 424242);
  // No upper bound below the one JavaScript can hold exactly.
  assert.equal(profileIdFromRouteParam(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test('anything else names nobody, and is not guessed at', () => {
  for (const param of [
    'abc',        // not a number
    '12abc',      // starts as one — the old parse read this as member 12
    'abc12',
    '1.5',        // not an id this database can hold
    '1e3',
    '0x10',
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
    assert.equal(profileIdFromRouteParam(param), null, JSON.stringify(param));
  }
});

test('no parameter at all names nobody', () => {
  assert.equal(profileIdFromRouteParam(null), null);
  assert.equal(profileIdFromRouteParam(undefined), null);
  assert.equal(profileIdFromRouteParam(7 as unknown as string), null, 'a number is not a route parameter');
});
