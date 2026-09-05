/** Energy-based speaking indication, not speech recognition. Separate on/off
 * levels and a time-based quiet hold avoid chatter and frame-rate dependence. */
export const SPEAKING_ON_RMS = 0.025;
export const SPEAKING_OFF_RMS = 0.015;
export const SPEAKING_QUIET_MS = 400;

export type AudioActivityState = { speaking: boolean; quietSince: number | null };

export function updateAudioActivity(state: AudioActivityState, samples: Float32Array, now: number): AudioActivityState {
  let power = 0;
  for (const sample of samples) power += sample * sample;
  const rms = samples.length ? Math.sqrt(power / samples.length) : 0;
  if (rms >= SPEAKING_ON_RMS) {
    return state.speaking && state.quietSince === null ? state : { speaking: true, quietSince: null };
  }
  if (rms > SPEAKING_OFF_RMS || !state.speaking) {
    return state.quietSince === null ? state : { speaking: state.speaking, quietSince: null };
  }
  const quietSince = state.quietSince ?? now;
  return now - quietSince >= SPEAKING_QUIET_MS
    ? { speaking: false, quietSince: null }
    : { speaking: true, quietSince };
}
