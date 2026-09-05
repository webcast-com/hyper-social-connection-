'use client';

import { useEffect, useRef, useState } from 'react';
import {
  advanceActiveSpeaker, clearSpeakerCandidate, createActiveSpeakerState,
  resolveActiveSpeaker, SPEAKER_POLL_MS, type SpeakerParticipant,
} from '@/lib/active-speaker';

/** One lightweight timer, only while the viewer explicitly follows speakers.
 * The WebRTC room remains the sole owner of streams, tracks and analysers. */
export function useActiveSpeaker(
  participants: readonly SpeakerParticipant[],
  enabled: boolean,
  isInteracting: () => boolean,
  beforeSwitch: () => void,
) {
  const machine = useRef(createActiveSpeakerState());
  const latest = useRef({ participants, isInteracting, beforeSwitch });
  const [speakerId, setSpeakerId] = useState<number | null>(null);

  useEffect(() => {
    latest.current = { participants, isInteracting, beforeSwitch };
  }, [participants, isInteracting, beforeSwitch]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A candidate heard before a manual view/menu is not evidence of sustained
    // speech after it. Keep the last speaker, but reconfirm any challenger.
    machine.current = clearSpeakerCandidate(machine.current);
    const tick = () => {
      if (cancelled) return;
      const current = latest.current;
      if (current.isInteracting()) {
        machine.current = clearSpeakerCandidate(machine.current);
        return;
      }
      const next = advanceActiveSpeaker(machine.current, current.participants, performance.now());
      if (next.currentId !== machine.current.currentId) {
        current.beforeSwitch();
        setSpeakerId(next.currentId);
      }
      machine.current = next;
    };
    // Defer state writes outside the effect body; cancel the queued first tick
    // as well as the interval on unmount or a switch to a manual/gallery view.
    queueMicrotask(tick);
    const timer = window.setInterval(tick, SPEAKER_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [enabled]);

  return enabled ? resolveActiveSpeaker(participants, speakerId) : null;
}
