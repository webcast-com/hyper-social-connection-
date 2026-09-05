import { expect, test } from '@playwright/test';
import {
  advanceActiveSpeaker, clearSpeakerCandidate, createActiveSpeakerState, resolveActiveSpeaker,
  SPEAKER_CONFIRM_MS, SPEAKER_MIN_HOLD_MS, type SpeakerParticipant,
} from '../../src/lib/active-speaker';

function people(talking: number[] = [], muted: number[] = []): SpeakerParticipant[] {
  return [1, 2, 3, 4].map((id) => ({ id, isLocal: id === 1, speaking: talking.includes(id), isMuted: muted.includes(id), connectionState: 'connected' }));
}

test('speaker view prefers a connected remote voice, independent of array order', () => {
  expect(resolveActiveSpeaker(people([1, 3]))).toBe(3);
  expect(resolveActiveSpeaker(people([1, 3]).reverse())).toBe(3);
  expect(resolveActiveSpeaker(people([1]))).toBe(2);
  expect(resolveActiveSpeaker(people([1]).slice(0, 1))).toBe(1);
  expect(resolveActiveSpeaker([])).toBeNull();
});

test('switching requires both sustained activity and a minimum hold', () => {
  let state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  expect(state.currentId).toBe(2);
  state = advanceActiveSpeaker(state, people([3]), 100);
  state = advanceActiveSpeaker(state, people([3]), 100 + SPEAKER_CONFIRM_MS);
  expect(state.currentId).toBe(2);
  state = advanceActiveSpeaker(state, people([3]), SPEAKER_MIN_HOLD_MS - 1);
  expect(state.currentId).toBe(2);
  state = advanceActiveSpeaker(state, people([3]), SPEAKER_MIN_HOLD_MS);
  expect(state.currentId).toBe(3);

  state = advanceActiveSpeaker(state, people([4]), 6000);
  state = advanceActiveSpeaker(state, people([4]), 6000 + SPEAKER_CONFIRM_MS - 1);
  expect(state.currentId).toBe(3);
  expect(advanceActiveSpeaker(state, people([4]), 6000 + SPEAKER_CONFIRM_MS).currentId).toBe(4);
});

test('brief or alternating activity does not steal the stage', () => {
  let state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  for (let now = 3000; now < 6000; now += 200) {
    state = advanceActiveSpeaker(state, people([now % 400 ? 3 : 4]), now);
    expect(state.currentId).toBe(2);
  }
  state = advanceActiveSpeaker(state, people(), 6200);
  expect(state.candidateId).toBeNull();
  expect(advanceActiveSpeaker(state, people(), 10_000).currentId).toBe(2);
});

test('overlapping voices keep the current speaker and resuming speech clears a challenger', () => {
  let state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  expect(advanceActiveSpeaker(state, people([2, 3, 4]), 10_000).currentId).toBe(2);
  state = advanceActiveSpeaker(state, people([3]), 11_000);
  state = advanceActiveSpeaker(state, people([2, 3]), 11_300);
  expect(state.candidateId).toBeNull();
  state = advanceActiveSpeaker(state, people([3]), 12_000);
  expect(state.currentId).toBe(2);
  expect(state.candidateSince).toBe(12_000);
});

test('muted and disconnected speaking flags are ignored, while silence keeps the last person', () => {
  let state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  state = advanceActiveSpeaker(state, people([1, 3], [3]), 5000);
  expect(state.currentId).toBe(2);
  expect(state.candidateId).toBeNull();
  const disconnected = people([3]).map((participant) => participant.id === 3 ? { ...participant, connectionState: 'disconnected' as const } : participant);
  expect(advanceActiveSpeaker(state, disconnected, 10_000).currentId).toBe(2);
  expect(advanceActiveSpeaker(state, people([], [2, 3, 4]), 20_000).currentId).toBe(2);
});

test('departures and connection loss use an immediate fallback, including an empty room', () => {
  const state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  expect(advanceActiveSpeaker(state, people([3]).filter((participant) => participant.id !== 2), 100).currentId).toBe(3);
  const failed = people([3]).map((participant) => participant.id === 2 ? { ...participant, connectionState: 'failed' as const } : participant);
  expect(advanceActiveSpeaker(state, failed, 100).currentId).toBe(3);
  expect(advanceActiveSpeaker(state, people().slice(0, 1), 100).currentId).toBe(1);
  expect(advanceActiveSpeaker(state, [], 100).currentId).toBeNull();
});

test('returning from an interaction requires a fresh confirmation, not stale elapsed time', () => {
  let state = advanceActiveSpeaker(createActiveSpeakerState(), people([2]), 0);
  state = advanceActiveSpeaker(state, people([3]), 3000);
  state = clearSpeakerCandidate(state);
  state = advanceActiveSpeaker(state, people([3]), 30_000);
  expect(state.currentId).toBe(2);
  expect(state.candidateSince).toBe(30_000);
  expect(advanceActiveSpeaker(state, people([3]), 30_000 + SPEAKER_CONFIRM_MS).currentId).toBe(3);
});
