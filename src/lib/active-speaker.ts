/** Viewer-local selection driven by the existing speaking indicators, not by
 * new audio capture or a second set of WebAudio analysers. */
export const SPEAKER_CONFIRM_MS = 500;
export const SPEAKER_MIN_HOLD_MS = 2500;
export const SPEAKER_POLL_MS = 200;

export type SpeakerParticipant = {
  id: number;
  isLocal?: boolean;
  speaking?: boolean;
  isMuted?: boolean;
  connectionState?: RTCPeerConnectionState;
};

export type ActiveSpeakerState = {
  currentId: number | null;
  changedAt: number;
  candidateId: number | null;
  candidateSince: number;
};

export function createActiveSpeakerState(): ActiveSpeakerState {
  return { currentId: null, changedAt: 0, candidateId: null, candidateSince: 0 };
}

function isConnected(participant: SpeakerParticipant) {
  return !participant.connectionState || participant.connectionState === 'connected';
}

function isTalking(participant: SpeakerParticipant) {
  return Boolean(participant.speaking && !participant.isMuted && isConnected(participant));
}

function candidates(participants: readonly SpeakerParticipant[]) {
  const connected = participants.filter(isConnected);
  const remote = connected.filter((participant) => !participant.isLocal);
  // Don't cut back to one's own mirrored preview while other people are in the
  // call. With no connected peers, retain a usable local/connecting fallback.
  const pool = remote.length ? remote : connected.length ? connected : participants;
  return [...pool].sort((a, b) => a.id - b.id);
}

/** A synchronous fallback prevents blank frames on the first render or when a
 * participant leaves between timer ticks. Silence keeps the previous person. */
export function resolveActiveSpeaker(participants: readonly SpeakerParticipant[], previousId: number | null = null) {
  const pool = candidates(participants);
  return participants.find((participant) => participant.id === previousId)?.id
    ?? pool.find(isTalking)?.id
    ?? pool[0]?.id
    ?? null;
}

export function clearSpeakerCandidate(state: ActiveSpeakerState): ActiveSpeakerState {
  return state.candidateId === null ? state : { ...state, candidateId: null, candidateSince: 0 };
}

/** Require sustained activity and a minimum hold. Overlapping voices keep the
 * current speaker; muted/stale/disconnected indicators cannot steal focus. */
export function advanceActiveSpeaker(
  state: ActiveSpeakerState,
  participants: readonly SpeakerParticipant[],
  now: number,
): ActiveSpeakerState {
  const pool = candidates(participants);
  const current = pool.find((participant) => participant.id === state.currentId);
  if (!current) {
    const currentId = resolveActiveSpeaker(participants);
    return currentId === null && state.currentId === null
      ? clearSpeakerCandidate(state)
      : { currentId, changedAt: now, candidateId: null, candidateSince: 0 };
  }
  if (isTalking(current)) return clearSpeakerCandidate(state);

  const talking = pool.filter((participant) => participant.id !== current.id && isTalking(participant));
  const candidate = talking.find((participant) => participant.id === state.candidateId) ?? talking[0];
  if (!candidate) return clearSpeakerCandidate(state);
  if (candidate.id !== state.candidateId) return { ...state, candidateId: candidate.id, candidateSince: now };
  if (now - state.candidateSince < SPEAKER_CONFIRM_MS || now - state.changedAt < SPEAKER_MIN_HOLD_MS) return state;
  return { currentId: candidate.id, changedAt: now, candidateId: null, candidateSince: 0 };
}
