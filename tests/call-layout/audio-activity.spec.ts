import { expect, test } from '@playwright/test';
import { SPEAKING_QUIET_MS, updateAudioActivity, type AudioActivityState } from '../../src/lib/audio-activity';

const signal = (amplitude: number) => new Float32Array(512).fill(amplitude);
const idle: AudioActivityState = { speaking: false, quietSince: null };

test('the speaking meter ignores low-amplitude noise and detects normal energy', () => {
  expect(updateAudioActivity(idle, signal(0), 0)).toEqual(idle);
  expect(updateAudioActivity(idle, signal(0.005), 0)).toEqual(idle);
  expect(updateAudioActivity(idle, new Float32Array(), 0)).toEqual(idle);
  expect(updateAudioActivity(idle, signal(0.1), 0).speaking).toBe(true);
  expect(updateAudioActivity(idle, signal(-0.1), 0).speaking).toBe(true);
});

test('separate levels and sustained quiet avoid flicker without depending on frame count', () => {
  let state = updateAudioActivity(idle, signal(0.1), 0);
  state = updateAudioActivity(state, signal(0.02), 100);
  expect(state.speaking).toBe(true);
  expect(updateAudioActivity(idle, signal(0.02), 100).speaking).toBe(false);
  state = updateAudioActivity(state, signal(0), 200);
  expect(updateAudioActivity(state, signal(0), 200 + SPEAKING_QUIET_MS - 1).speaking).toBe(true);
  expect(updateAudioActivity(state, signal(0), 200 + SPEAKING_QUIET_MS).speaking).toBe(false);
  // Sparse frames after a hidden/background tab don't require 25 new frames.
  expect(updateAudioActivity(state, signal(0), 10_000).speaking).toBe(false);
});

test('a resumed signal cancels the pending quiet release', () => {
  let state = updateAudioActivity(idle, signal(0.1), 0);
  state = updateAudioActivity(state, signal(0), 100);
  state = updateAudioActivity(state, signal(0.1), 300);
  expect(state.quietSince).toBeNull();
  state = updateAudioActivity(state, signal(0), 500);
  expect(state.quietSince).toBe(500);
  expect(state.speaking).toBe(true);
});
