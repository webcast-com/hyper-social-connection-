import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPredictionKickoff } from '../../src/lib/sports';

test('provider-independent prediction kickoff labels retain Nairobi time and day rollover', () => {
  assert.match(formatPredictionKickoff('2026-09-02T19:00:00Z'), /^2 .*22:00 EAT$/);
  assert.match(formatPredictionKickoff('2026-09-02T22:30:00Z'), /^3 .*01:30 EAT$/);
  assert.equal(formatPredictionKickoff('invalid'), '');
});
