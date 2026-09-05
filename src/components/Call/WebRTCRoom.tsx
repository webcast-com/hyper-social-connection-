'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Hand,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneCall,
  PhoneOff,
  Send,
  Settings,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import ParticipantGallery from './ParticipantGallery';
import { updateAudioActivity, type AudioActivityState } from '@/lib/audio-activity';
import callChrome from './CallChrome.module.css';

type CallType = 'video' | 'audio';
type Viewer = { id: number; name: string; avatar: string | null };

type CallInfo = {
  id: number;
  title: string;
  description: string | null;
  roomUrl: string;
  callType?: CallType;
  creator: { id: number; name: string; avatar: string | null };
};

type Participant = {
  userId: number;
  name: string;
  avatar: string | null;
  joinedAt?: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSharing?: boolean;
  handRaisedAt?: string | null;
};

type ChatMessage = {
  id: number;
  userId: number;
  name: string;
  avatar: string | null;
  body: string;
  createdAt: string;
};

type Signal = { id: number; callId: number; fromId: number; toId: number | null; kind: string; payload: string };

type PeerEntry = {
  userId: number;
  name: string;
  avatar: string | null;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  candidates: RTCIceCandidateInit[];
  connected: boolean;
  connectionState: RTCPeerConnectionState;
  joinedAt?: string;
  stopSpeaking: () => void;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Heartbeat cadence — must stay well under PARTICIPANT_STALE_SECONDS (25s). */
const HEARTBEAT_MS = 8000;

/**
 * Speaking detection via WebAudio. Returns a cleanup function.
 * Shared by the "who is talking" ring and the optional speaker view.
 * The view does not create additional audio contexts or capture tracks.
 */
function monitorSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void) {
  // A replaced/rejoined stream must not inherit its predecessor's active flag,
  // including when the new stream is silent or WebAudio is unavailable.
  onChange(false);
  let ctx: AudioContext | null = null;
  let raf = 0;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return () => {};
    ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let activity: AudioActivityState = { speaking: false, quietSince: null };

    const tick = () => {
      // RMS measures signal amplitude instead of averaging logarithmic FFT
      // bins, which can mistake low-level noise for continuous speech. A timed
      // release also works when a background tab produces fewer animation frames.
      analyser.getFloatTimeDomainData(data);
      const next = updateAudioActivity(activity, data, performance.now());
      if (next.speaking !== activity.speaking) onChange(next.speaking);
      activity = next;
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    ctx?.close().catch(() => {});
    return () => {};
  }

  return () => {
    cancelAnimationFrame(raf);
    ctx?.close().catch(() => {});
  };
}

function closePeer(entry: PeerEntry) {
  entry.stopSpeaking();
  entry.pc.ontrack = null;
  entry.pc.onicecandidate = null;
  entry.pc.onconnectionstatechange = null;
  entry.pc.close();
}

export default function WebRTCRoom({
  call,
  viewer,
  callType,
  onLeave,
}: {
  call: CallInfo;
  viewer: Viewer;
  callType: CallType;
  onLeave: () => void;
}) {
  // The call's own type wins over whatever the local picker happened to show —
  // a joiner must not open a camera in an audio-only room.
  const effectiveCallType: CallType = call.callType ?? callType;
  const isAudioCall = effectiveCallType === 'audio';
  const isHost = viewer.id === call.creator.id;

  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersMapRef = useRef<Map<number, PeerEntry>>(new Map());
  const lastSignalIdRef = useRef(0);
  const lastChatIdRef = useRef(0);
  const leavingRef = useRef(false);
  const joinedRef = useRef(false);
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);
  const localSpeakingStopRef = useRef<() => void>(() => {});
  const localStateRef = useRef({ isMuted: false, isCameraOff: isAudioCall, isSharing: false, handRaised: false });

  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [peers, setPeers] = useState<PeerEntry[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<number>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatDraft, setChatDraft] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [ended, setEnded] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Mirrors `chatOpen` for the poll loop, which must not count messages as
  // unread while the panel is visible (and must not re-subscribe on toggle).
  const chatOpenRef = useRef(false);

  const setSpeaking = useCallback((userId: number, speaking: boolean) => {
    setSpeakingIds((prev) => {
      const next = new Set(prev);
      if (speaking) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  /** Release devices immediately, even if the leave request cannot reach the server. */
  const releaseResources = useCallback(() => {
    localSpeakingStopRef.current();
    localSpeakingStopRef.current = () => {};
    for (const entry of peersMapRef.current.values()) closePeer(entry);
    peersMapRef.current.clear();
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    // During screen sharing the camera is not in localStream, but is still open.
    cameraTrackRef.current?.stop();
    screenStreamRef.current = null;
    localStreamRef.current = null;
    cameraTrackRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    if (disconnectPromiseRef.current) return disconnectPromiseRef.current;
    leavingRef.current = true;
    const wasJoined = joinedRef.current;
    joinedRef.current = false;
    releaseResources();
    disconnectPromiseRef.current = wasJoined
      ? fetch(`/api/group-calls/participants?callId=${call.id}`, { method: 'DELETE', keepalive: true })
          .then(() => {}).catch(() => {})
      : Promise.resolve();
    return disconnectPromiseRef.current;
  }, [call.id, releaseResources]);

  // X, Escape, backdrop, footer, navigation and React unmount all take this
  // path, not just the room's own Leave button. Safe under Strict Mode replay.
  useEffect(() => {
    leavingRef.current = false;
    disconnectPromiseRef.current = null;
    return () => { void disconnect(); };
  }, [disconnect]);

  const checkCallStatus = useCallback((response: Response, message?: string) => {
    if (response.status === 410) {
      void disconnect();
      setEnded(true);
      return true;
    }
    if (response.status === 401 || response.status === 403) {
      void disconnect();
      setLocalReady(false);
      setError(message || 'Your call session expired or access was removed. Leave and rejoin to try again.');
      return true;
    }
    return false;
  }, [disconnect]);

  const sendSignal = useCallback(
    async (toId: number | null, kind: string, payload: string) => {
      let failure = 'Could not send call connection data.';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (leavingRef.current || !joinedRef.current) return;
        try {
          const response = await fetch('/api/group-calls/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: call.id, toId, kind, payload }),
            signal: AbortSignal.timeout(8000),
          });
          if (response.ok || checkCallStatus(response)) return;
          const data = await response.json().catch(() => null);
          failure = data?.error || failure;
          if (response.status < 500 && response.status !== 429) break;
        } catch {
          // Retry transient failures; polling receives signals but cannot
          // recover a lost outgoing offer, answer or ICE candidate.
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
      if (!leavingRef.current) setNotice(`${failure} Leave and rejoin if the connection does not recover.`);
      throw new Error(failure);
    },
    [call.id, checkCallStatus],
  );

  /** Heartbeats resend the full latest state, recovering a failed toggle PATCH. */
  const pushState = useCallback(
    async (state: Record<string, boolean>) => {
      Object.assign(localStateRef.current, state);
      if (!joinedRef.current || leavingRef.current) return;
      try {
        const response = await fetch(`/api/group-calls/participants?callId=${call.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localStateRef.current),
          signal: AbortSignal.timeout(8000),
        });
        checkCallStatus(response);
      } catch {
        // The next heartbeat resends the latest state.
      }
    },
    [call.id, checkCallStatus],
  );

  const refreshPeers = useCallback(() => {
    setPeers(Array.from(peersMapRef.current.values()));
  }, []);

  const addCandidate = useCallback(async (entry: PeerEntry, candidate: RTCIceCandidateInit) => {
    if (entry.pc.remoteDescription) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        // Ignore candidates that arrive out of order.
      }
    } else {
      entry.candidates.push(candidate);
    }
  }, []);

  const flushCandidates = useCallback(async (entry: PeerEntry) => {
    for (const candidate of entry.candidates) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
    entry.candidates = [];
  }, []);

  const createPeer = useCallback(
    async (participant: Participant, asInitiator: boolean) => {
      if (leavingRef.current || !joinedRef.current || !localStreamRef.current) return;
      if (participant.userId === viewer.id) return;
      if (peersMapRef.current.has(participant.userId)) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = {
        userId: participant.userId,
        name: participant.name,
        avatar: participant.avatar,
        pc,
        stream: null,
        candidates: [],
        connected: false,
        connectionState: 'new',
        joinedAt: participant.joinedAt,
        stopSpeaking: () => {},
      };
      peersMapRef.current.set(participant.userId, entry);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(participant.userId, 'ice', JSON.stringify(event.candidate.toJSON())).catch(() => {});
        }
      };

      pc.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote) {
          entry.stream = remote;
          entry.stopSpeaking();
          entry.stopSpeaking = monitorSpeaking(remote, (speaking) => setSpeaking(participant.userId, speaking));
          refreshPeers();
        }
      };

      pc.onconnectionstatechange = () => {
        entry.connected = pc.connectionState === 'connected';
        entry.connectionState = pc.connectionState;
        refreshPeers();
      };

      if (asInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(participant.userId, 'offer', JSON.stringify(pc.localDescription));
        } catch {
          // ignore negotiation errors
        }
      }
      refreshPeers();
    },
    [viewer.id, sendSignal, refreshPeers, setSpeaking],
  );

  // ── Signal handling ───────────────────────────────────────────────────────
  const handleSignal = useCallback(
    async (signal: Signal) => {
      if (leavingRef.current || !joinedRef.current || signal.kind === 'join') return;
      const fromId = signal.fromId;
      let payload: any;
      try {
        payload = JSON.parse(signal.payload);
      } catch {
        payload = signal.payload;
      }

      if (signal.kind === 'bye') {
        const entry = peersMapRef.current.get(fromId);
        if (entry) {
          closePeer(entry);
          peersMapRef.current.delete(fromId);
          setSpeaking(fromId, false);
          refreshPeers();
        }
        return;
      }

      let entry = peersMapRef.current.get(fromId);
      if (!entry) {
        // Remote peer initiated (they have a lower id). Create an answerer peer.
        const participant = { userId: fromId, name: `User ${fromId}`, avatar: null };
        await createPeer(participant, false);
        entry = peersMapRef.current.get(fromId);
        if (!entry) return;
      }

      if (signal.kind === 'offer') {
        try {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          await flushCandidates(entry);
          await sendSignal(fromId, 'answer', JSON.stringify(entry.pc.localDescription));
        } catch {
          // ignore
        }
      } else if (signal.kind === 'answer') {
        try {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(payload));
          await flushCandidates(entry);
        } catch {
          // ignore
        }
      } else if (signal.kind === 'ice') {
        if (payload?.candidate) {
          // toJSON() sends the complete RTCIceCandidateInit, not a wrapper.
          // Passing only .candidate loses sdpMid/sdpMLineIndex and is invalid.
          await addCandidate(entry, payload as RTCIceCandidateInit);
        }
      }
    },
    [createPeer, sendSignal, addCandidate, flushCandidates, refreshPeers, setSpeaking],
  );

  // ── Participant sync ─────────────────────────────────────────────────────
  const syncParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-calls/participants?callId=${call.id}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      const data = (await res.json().catch(() => null)) as { participants?: Participant[] } | null;
      if (leavingRef.current || !joinedRef.current || checkCallStatus(res)) return;
      if (!res.ok || !data?.participants) return;
      setParticipants(data.participants);

      const liveIds = new Set(data.participants.map((p) => p.userId));

      for (const participant of data.participants) {
        if (participant.userId === viewer.id) continue;
        // We initiate only when we have the lower id; otherwise the remote
        // (lower id) peer sends us an offer which we answer.
        const asInitiator = viewer.id < participant.userId;
        const previous = peersMapRef.current.get(participant.userId);
        if (previous?.joinedAt && previous.joinedAt !== participant.joinedAt) {
          closePeer(previous);
          peersMapRef.current.delete(participant.userId);
        }
        if (!peersMapRef.current.has(participant.userId)) {
          await createPeer(participant, asInitiator);
        } else {
          // Keep names/avatars fresh for peers first seen via a raw signal.
          const entry = peersMapRef.current.get(participant.userId)!;
          entry.name = participant.name;
          entry.avatar = participant.avatar;
          entry.joinedAt = participant.joinedAt;
        }
      }

      // Tear down peers the server no longer lists (left or went stale).
      for (const [userId, entry] of peersMapRef.current) {
        if (!liveIds.has(userId)) {
          closePeer(entry);
          peersMapRef.current.delete(userId);
          setSpeaking(userId, false);
        }
      }
      refreshPeers();
    } catch {
      // ignore transient failures
    }
  }, [call.id, viewer.id, createPeer, refreshPeers, setSpeaking, checkCallStatus]);

  // ── Poll loop: serial requests, only after media and registration are ready ──
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || leavingRef.current) return;
      try {
        await syncParticipants();
        if (cancelled || leavingRef.current) return;
        const res = await fetch(
          `/api/group-calls/signal?callId=${call.id}&after=${lastSignalIdRef.current}`,
          { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
        );
        if (cancelled || leavingRef.current || checkCallStatus(res)) return;
        const data = (await res.json().catch(() => null)) as { signals?: Signal[]; lastId?: number } | null;
        if (res.ok && data?.signals) {
          for (const signal of data.signals) {
            if (cancelled || leavingRef.current) return;
            await handleSignal(signal);
          }
          if (data.lastId) lastSignalIdRef.current = data.lastId;
        }

        const chatRes = await fetch(
          `/api/group-calls/chat?callId=${call.id}&after=${lastChatIdRef.current}`,
          { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
        );
        if (cancelled || leavingRef.current || checkCallStatus(chatRes)) return;
        const chat = (await chatRes.json().catch(() => null)) as
          | { messages?: ChatMessage[]; lastId?: number }
          | null;
        if (chatRes.ok && chat?.messages?.length) {
          setMessages((prev) => [...prev, ...chat.messages!]);
          if (!chatOpenRef.current) {
            const incoming = chat.messages.filter((m) => m.userId !== viewer.id).length;
            if (incoming) setUnreadChat((n) => n + incoming);
          }
          if (chat.lastId) lastChatIdRef.current = chat.lastId;
        }
      } catch {
        // The next poll resumes from the last successfully processed cursor.
      } finally {
        // setInterval used to overlap slow polls, replaying offers and chat.
        if (!cancelled && !leavingRef.current) timer = setTimeout(poll, 1500);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [joined, call.id, handleSignal, syncParticipants, viewer.id, checkCallStatus]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  // ── Heartbeat so peers can detect a crashed tab ──────────────────────────
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => { void pushState({}); }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [joined, pushState]);

  // ── Acquire local media ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera and microphone access requires HTTPS and a supported browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !isAudioCall,
          audio: true,
        });
        if (cancelled || leavingRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setLocalReady(true);
        localSpeakingStopRef.current();
        localSpeakingStopRef.current = monitorSpeaking(stream, (speaking) => setSpeaking(viewer.id, speaking));

        navigator.mediaDevices
          .enumerateDevices()
          .then((list) => !cancelled && setDevices(list))
          .catch(() => {});
      } catch (err: any) {
        if (cancelled || leavingRef.current) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Microphone/camera permission was denied. Allow access and try again.'
            : err?.name === 'NotFoundError'
              ? 'No camera/microphone was found on this device.'
              : err?.message || 'Could not access your camera or microphone.',
        );
      }
    };
    acquire();
    return () => {
      cancelled = true;
    };
  }, [isAudioCall, viewer.id, setSpeaking]);

  // ── Join only AFTER local media is available; offers must contain tracks ──
  useEffect(() => {
    if (!localReady) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/group-calls/participants?callId=${call.id}`, {
          method: 'POST',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        const data = await response.json().catch(() => null);
        if (cancelled || leavingRef.current) {
          if (response.ok) {
            void fetch(`/api/group-calls/participants?callId=${call.id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
          }
          return;
        }
        if (checkCallStatus(response, data?.error)) return;
        if (!response.ok || !data?.joined) throw new Error(data?.error || 'Could not join the call.');
        lastSignalIdRef.current = data.lastSignalId ?? 0;
        joinedRef.current = true;
        setJoined(true);
        void pushState({});
      } catch (err) {
        if (cancelled || leavingRef.current) return;
        releaseResources();
        setLocalStream(null);
        setLocalReady(false);
        setError((err as Error).message || 'Could not join the call.');
      }
    })();
    return () => { cancelled = true; };
  }, [localReady, call.id, checkCallStatus, pushState, releaseResources]);

  const leave = useCallback(() => {
    void disconnect();
    onLeave();
  }, [disconnect, onLeave]);

  useEffect(() => {
    const onUnload = () => {
      if (joinedRef.current) {
        navigator.sendBeacon?.(`/api/group-calls/participants?callId=${call.id}&beacon=leave`);
      }
      void disconnect();
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [call.id, disconnect]);

  const endForEveryone = useCallback(async () => {
    if (!isHost) return;
    try {
      const response = await fetch(`/api/group-calls?callId=${call.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not end the call.');
      }
      leave();
    } catch (err) {
      setNotice((err as Error).message || 'Could not end the call.');
    }
  }, [isHost, call.id, leave]);

  const toggleMute = () => {
    const next = !localStateRef.current.isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    void pushState({ isMuted: next });
  };

  const toggleCam = () => {
    const next = !localStateRef.current.isCameraOff;
    // Camera controls must not disable an outgoing screen-share track.
    if (cameraTrackRef.current) cameraTrackRef.current.enabled = !next;
    setCamOff(next);
    void pushState({ isCameraOff: next });
  };

  const toggleHand = () => {
    const next = !localStateRef.current.handRaised;
    setHandRaised(next);
    void pushState({ handRaised: next });
  };

  /** Replace the outgoing video track on every peer connection. */
  const replaceVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const entry of peersMapRef.current.values()) {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const stopSharing = useCallback(async () => {
    if (leavingRef.current) return;
    screenStreamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    screenStreamRef.current = null;

    const camera = cameraTrackRef.current;
    await replaceVideoTrack(camera ?? null);

    if (camera && localStreamRef.current) {
      const stream = localStreamRef.current;
      stream.getVideoTracks().forEach((t) => {
        if (t !== camera) stream.removeTrack(t);
      });
      if (!stream.getVideoTracks().includes(camera)) stream.addTrack(camera);
      setLocalStream(new MediaStream(stream.getTracks()));
    }

    setSharing(false);
    pushState({ isSharing: false });
  }, [replaceVideoTrack, pushState]);

  const startSharing = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (leavingRef.current) {
        display.getTracks().forEach((track) => track.stop());
        return;
      }
      screenStreamRef.current = display;
      const track = display.getVideoTracks()[0];
      if (!track) {
        display.getTracks().forEach((item) => item.stop());
        return;
      }

      // The browser's own "Stop sharing" bar ends the track directly.
      track.onended = () => {
        stopSharing().catch(() => {});
      };

      await replaceVideoTrack(track);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
        stream.addTrack(track);
        setLocalStream(new MediaStream(stream.getTracks()));
      }

      setSharing(true);
      pushState({ isSharing: true });
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setNotice('Screen sharing is not available in this browser.');
        setTimeout(() => setNotice(''), 4000);
      }
    }
  }, [replaceVideoTrack, stopSharing, pushState]);

  const switchDevice = useCallback(
    async (deviceId: string, kind: 'audioinput' | 'videoinput') => {
      let fresh: MediaStream | null = null;
      try {
        const constraints: MediaStreamConstraints =
          kind === 'videoinput'
            ? { video: { deviceId: { exact: deviceId } }, audio: false }
            : { audio: { deviceId: { exact: deviceId } }, video: false };
        fresh = await navigator.mediaDevices.getUserMedia(constraints);
        const stream = localStreamRef.current;
        if (leavingRef.current || !stream) {
          fresh.getTracks().forEach((track) => track.stop());
          return;
        }
        const newTrack = kind === 'videoinput' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
        if (!newTrack) return;
        // Set enabled before publishing, so device switches cannot briefly
        // unmute a microphone or turn on a camera the user deliberately hid.
        newTrack.enabled = kind === 'videoinput' ? !localStateRef.current.isCameraOff : !localStateRef.current.isMuted;
        if (kind === 'videoinput') {
          const oldCamera = cameraTrackRef.current;
          cameraTrackRef.current = newTrack;
          if (!screenStreamRef.current) {
            await replaceVideoTrack(newTrack);
            stream.getVideoTracks().forEach((track) => stream.removeTrack(track));
            stream.addTrack(newTrack);
          }
          // During sharing, replace only the parked camera, not the display.
          oldCamera?.stop();
        } else {
          const old = stream.getAudioTracks()[0];
          for (const entry of peersMapRef.current.values()) {
            const sender = entry.pc.getSenders().find((item) => item.track?.kind === 'audio');
            if (sender) await sender.replaceTrack(newTrack);
          }
          if (leavingRef.current) { fresh.getTracks().forEach((track) => track.stop()); return; }
          if (old) { stream.removeTrack(old); old.stop(); }
          stream.addTrack(newTrack);
          localSpeakingStopRef.current();
          localSpeakingStopRef.current = monitorSpeaking(stream, (speaking) => setSpeaking(viewer.id, speaking));
        }
        if (leavingRef.current) { fresh.getTracks().forEach((track) => track.stop()); return; }
        setLocalStream(new MediaStream(stream.getTracks()));
        setShowDevices(false);
      } catch {
        fresh?.getTracks().forEach((track) => track.stop());
        if (!leavingRef.current) setNotice('Could not switch device.');
      }
    },
    [replaceVideoTrack, setSpeaking, viewer.id],
  );

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body || !joinedRef.current) return;
    setChatDraft('');
    try {
      const response = await fetch('/api/group-calls/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, body }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Message could not be sent.');
      }
    } catch (err) {
      setChatDraft((draft) => draft || body);
      setNotice((err as Error).message || 'Message could not be sent.');
    }
  };

  const stateByUser = useMemo(() => {
    const map = new Map<number, Participant>();
    for (const p of participants) map.set(p.userId, p);
    return map;
  }, [participants]);

  const raisedHands = useMemo(
    () => participants.filter((p) => p.handRaisedAt).sort((a, b) => String(a.handRaisedAt).localeCompare(String(b.handRaisedAt))),
    [participants],
  );

  const participantCount = Math.max(participants.length, peers.length + 1);

  if (ended) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <PhoneOff className="h-10 w-10 text-red-500" aria-hidden="true" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">This call has ended</h2>
        <button
          type="button"
          onClick={leave}
          className="mt-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`${callChrome.summaryHeader} flex items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-400/30 dark:bg-gray-900 sm:px-5`}>
        <div className="min-w-0">
          <div className={`${callChrome.liveLabel} flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300`}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live {isAudioCall ? 'audio' : 'video'} call
          </div>
          <h2 className="truncate text-base font-bold text-indigo-950 dark:text-white">
            {call.title}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {participantCount} {participantCount === 1 ? 'person' : 'people'} in the call
            {raisedHands.length > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-400 px-1.5 py-0.5 font-bold text-amber-950">
                <Hand className="h-3 w-3" aria-hidden="true" /> {raisedHands.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isHost && (
            <button
              type="button"
              onClick={endForEveryone}
              aria-label="End call for everyone"
              className="inline-flex items-center gap-2 rounded-xl border border-red-600 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <PhoneOff className="h-4 w-4" aria-hidden="true" />
              <span className={`${callChrome.controlLabel} hidden sm:inline`}>End for all</span>
            </button>
          )}
          <button
            type="button"
            onClick={leave}
            aria-label="Leave call"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            <span className={`${callChrome.controlLabel} hidden sm:inline`}>Leave</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
          {notice}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className={`${callChrome.mediaPane} flex min-h-0 min-w-0 flex-1 flex-col p-4`}>
          {!localReady && !error ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Requesting {isAudioCall ? 'microphone' : 'camera & microphone'}…
            </div>
          ) : (
            <ParticipantGallery participants={[
              {
                id: viewer.id,
                isLocal: true,
                stream: localStream,
                mirror: true,
                muted: true,
                label: `${viewer.name} (you)`,
                avatar: viewer.avatar,
                speaking: speakingIds.has(viewer.id) && !muted,
                isMuted: muted,
                isCameraOff: camOff,
                isSharing: sharing,
                handRaised,
                audioOnly: isAudioCall,
              },
              ...peers.map((entry) => {
                const state = stateByUser.get(entry.userId);
                return {
                  id: entry.userId,
                  stream: entry.stream,
                  label: entry.name,
                  avatar: entry.avatar,
                  speaking: speakingIds.has(entry.userId),
                  isMuted: state?.isMuted,
                  isCameraOff: state?.isCameraOff,
                  isSharing: state?.isSharing,
                  handRaised: Boolean(state?.handRaisedAt),
                  connectionState: entry.connectionState,
                  audioOnly: isAudioCall,
                };
              }),
            ]} />
          )}

          {localReady && joined && (
            <div className={`${callChrome.controls} relative mt-4 flex flex-wrap items-center justify-center gap-2`}>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                title={muted ? 'Unmute' : 'Mute'}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {muted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                <span className={`${callChrome.controlLabel} hidden sm:inline`}>{muted ? 'Unmute' : 'Mute'}</span>
              </button>

              {!isAudioCall && (
                <button
                  type="button"
                  onClick={toggleCam}
                  aria-pressed={camOff}
                  title={camOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${camOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  {camOff ? <VideoOff className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
                  <span className={`${callChrome.controlLabel} hidden sm:inline`}>{camOff ? 'Camera on' : 'Camera off'}</span>
                </button>
              )}

              {!isAudioCall && (
                <button
                  type="button"
                  onClick={sharing ? stopSharing : startSharing}
                  aria-pressed={sharing}
                  title={sharing ? 'Stop sharing' : 'Share your screen'}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${sharing ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                >
                  {sharing ? <MonitorX className="h-4 w-4" aria-hidden="true" /> : <MonitorUp className="h-4 w-4" aria-hidden="true" />}
                  <span className={`${callChrome.controlLabel} hidden sm:inline`}>{sharing ? 'Stop share' : 'Share'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleHand}
                aria-pressed={handRaised}
                title={handRaised ? 'Lower hand' : 'Raise hand'}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${handRaised ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
              >
                <Hand className="h-4 w-4" aria-hidden="true" />
                <span className={`${callChrome.controlLabel} hidden sm:inline`}>{handRaised ? 'Lower' : 'Raise'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setChatOpen((open) => {
                    const next = !open;
                    chatOpenRef.current = next;
                    if (next) setUnreadChat(0);
                    return next;
                  })
                }
                aria-pressed={chatOpen}
                title="Chat"
                className="relative inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span className={`${callChrome.controlLabel} hidden sm:inline`}>Chat</span>
                {unreadChat > 0 && !chatOpen && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDevices((s) => !s)}
                aria-pressed={showDevices}
                title="Audio & video devices"
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>

              {showDevices && (
                <div className="absolute bottom-14 z-10 w-72 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Microphone
                  </div>
                  <div className="mb-3 space-y-1">
                    {devices.filter((d) => d.kind === 'audioinput').map((d) => (
                      <button
                        key={d.deviceId}
                        type="button"
                        onClick={() => switchDevice(d.deviceId, 'audioinput')}
                        className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {d.label || 'Microphone'}
                      </button>
                    ))}
                  </div>
                  {!isAudioCall && (
                    <>
                      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Camera
                      </div>
                      <div className="space-y-1">
                        {devices.filter((d) => d.kind === 'videoinput').map((d) => (
                          <button
                            key={d.deviceId}
                            type="button"
                            onClick={() => switchDevice(d.deviceId, 'videoinput')}
                            className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            {d.label || 'Camera'}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {devices.length === 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Device names appear after you grant permission.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {chatOpen && (
          <aside className="absolute inset-0 z-10 flex w-full flex-col sm:static sm:max-w-xs sm:shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
              <span className="text-sm font-bold text-gray-900 dark:text-white">In-call chat</span>
              <button
                type="button"
                onClick={() => {
                  chatOpenRef.current = false;
                  setChatOpen(false);
                }}
                aria-label="Close chat"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div ref={chatScrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Messages are visible to everyone in this call.
                </p>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="text-sm">
                    <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      {message.userId === viewer.id ? 'You' : message.name}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">
                      {message.body}
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={sendChat} className="flex items-center gap-2 border-t border-gray-200 p-2 dark:border-gray-700">
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                maxLength={500}
                placeholder="Message everyone…"
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={!chatDraft.trim()}
                aria-label="Send message"
                className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
