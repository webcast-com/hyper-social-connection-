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
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Heartbeat cadence — must stay well under PARTICIPANT_STALE_SECONDS (25s). */
const HEARTBEAT_MS = 8000;

/**
 * Speaking detection via WebAudio. Returns a cleanup function.
 * Used for the "who is talking" ring, which is the main thing that makes a
 * multi-person grid readable.
 */
function monitorSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void) {
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
    const data = new Uint8Array(analyser.frequencyBinCount);
    let speaking = false;
    let quietFrames = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      const average = sum / data.length;

      if (average > 18) {
        quietFrames = 0;
        if (!speaking) {
          speaking = true;
          onChange(true);
        }
      } else if (speaking) {
        // Require sustained quiet so the ring does not flicker between words.
        quietFrames += 1;
        if (quietFrames > 25) {
          speaking = false;
          onChange(false);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    return () => {};
  }

  return () => {
    cancelAnimationFrame(raf);
    ctx?.close().catch(() => {});
  };
}

function VideoTile({
  stream,
  mirror,
  muted,
  label,
  avatar,
  speaking,
  isMuted,
  isCameraOff,
  isSharing,
  handRaised,
  connectionState,
  audioOnly,
}: {
  stream: MediaStream | null;
  mirror?: boolean;
  muted?: boolean;
  label: string;
  avatar: string | null;
  speaking?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSharing?: boolean;
  handRaised?: boolean;
  connectionState?: RTCPeerConnectionState;
  audioOnly?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);

  const hasVideo = Boolean(stream) && !audioOnly && !isCameraOff;
  const reconnecting =
    connectionState === 'disconnected' || connectionState === 'failed' || connectionState === 'connecting';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gray-950 shadow-lg ring-1 transition-all ${
        speaking ? 'ring-2 ring-emerald-400' : 'ring-gray-800'
      }`}
    >
      {hasVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${mirror && !isSharing ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {/* Keep the element mounted so remote audio keeps playing with the camera off. */}
          {stream && <video ref={ref} autoPlay playsInline muted={muted} className="hidden" />}
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={label}
              className={`h-20 w-20 rounded-full object-cover ${speaking ? 'ring-4 ring-emerald-400' : ''}`}
            />
          ) : (
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-2xl font-bold text-white ${
                speaking ? 'ring-4 ring-emerald-400' : ''
              }`}
            >
              {label?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
      )}

      {handRaised && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950 shadow">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" /> Hand raised
        </div>
      )}

      {isSharing && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white shadow">
          <MonitorUp className="h-3.5 w-3.5" aria-hidden="true" /> Sharing
        </div>
      )}

      {reconnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/60 text-xs font-semibold text-white">
          <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          {connectionState === 'failed' ? 'Connection lost' : 'Connecting…'}
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
        {isMuted ? (
          <MicOff className="h-3 w-3 shrink-0 text-red-400" aria-label="Muted" />
        ) : (
          <Mic className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
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

  const sendSignal = useCallback(
    async (toId: number | null, kind: string, payload: string) => {
      try {
        await fetch('/api/group-calls/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.id, toId, kind, payload }),
        });
      } catch {
        // Signaling failures are non-fatal; the poll loop retries.
      }
    },
    [call.id],
  );

  /** Push local mute/camera/share/hand state (and heartbeat) to the server. */
  const pushState = useCallback(
    async (state: Record<string, boolean>) => {
      try {
        await fetch(`/api/group-calls/participants?callId=${call.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
      } catch {
        // Non-fatal — the next heartbeat will carry the state.
      }
    },
    [call.id],
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
          monitorSpeaking(remote, (speaking) => setSpeaking(participant.userId, speaking));
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
          try {
            entry.pc.close();
          } catch {
            // ignore
          }
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
          await addCandidate(entry, payload.candidate);
        }
      }
    },
    [createPeer, sendSignal, addCandidate, flushCandidates, refreshPeers, setSpeaking],
  );

  // ── Participant sync ─────────────────────────────────────────────────────
  const syncParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-calls/participants?callId=${call.id}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { participants?: Participant[] } | null;
      if (!res.ok || !data?.participants) return;
      setParticipants(data.participants);

      const liveIds = new Set(data.participants.map((p) => p.userId));

      for (const participant of data.participants) {
        if (participant.userId === viewer.id) continue;
        // We initiate only when we have the lower id; otherwise the remote
        // (lower id) peer sends us an offer which we answer.
        const asInitiator = viewer.id < participant.userId;
        if (!peersMapRef.current.has(participant.userId)) {
          await createPeer(participant, asInitiator);
        } else {
          // Keep names/avatars fresh for peers first seen via a raw signal.
          const entry = peersMapRef.current.get(participant.userId)!;
          entry.name = participant.name;
          entry.avatar = participant.avatar;
        }
      }

      // Tear down peers the server no longer lists (left or went stale).
      let removed = false;
      for (const [userId, entry] of peersMapRef.current) {
        if (!liveIds.has(userId)) {
          try {
            entry.pc.close();
          } catch {
            // ignore
          }
          peersMapRef.current.delete(userId);
          setSpeaking(userId, false);
          removed = true;
        }
      }
      if (removed) refreshPeers();
    } catch {
      // ignore transient failures
    }
  }, [call.id, viewer.id, createPeer, refreshPeers, setSpeaking]);

  // ── Poll loop: signals + participants + chat ─────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled || leavingRef.current) return;
      try {
        const res = await fetch(
          `/api/group-calls/signal?callId=${call.id}&after=${lastSignalIdRef.current}`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => null)) as { signals?: Signal[]; lastId?: number } | null;
        if (res.ok && data?.signals) {
          for (const signal of data.signals) {
            if (cancelled) return;
            await handleSignal(signal);
          }
          if (data.lastId) lastSignalIdRef.current = data.lastId;
        }
      } catch {
        // ignore
      }

      // Chat
      try {
        const res = await fetch(
          `/api/group-calls/chat?callId=${call.id}&after=${lastChatIdRef.current}`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => null)) as
          | { messages?: ChatMessage[]; lastId?: number }
          | null;
        if (res.ok && data?.messages?.length) {
          setMessages((prev) => [...prev, ...data.messages!]);
          if (!chatOpenRef.current) {
            const incoming = data.messages.filter((m) => m.userId !== viewer.id).length;
            if (incoming) setUnreadChat((n) => n + incoming);
          }
          if (data.lastId) lastChatIdRef.current = data.lastId;
        }
      } catch {
        // ignore
      }

      await syncParticipants();
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [call.id, handleSignal, syncParticipants, viewer.id]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  // ── Heartbeat so peers can detect a crashed tab ──────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (!leavingRef.current) pushState({});
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [pushState]);

  // ── Acquire local media ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !isAudioCall,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setLocalReady(true);
        monitorSpeaking(stream, (speaking) => setSpeaking(viewer.id, speaking));

        navigator.mediaDevices
          .enumerateDevices()
          .then((list) => !cancelled && setDevices(list))
          .catch(() => {});
      } catch (err: any) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Microphone/camera permission was denied. Allow access and try again.'
            : err?.name === 'NotFoundError'
              ? 'No camera/microphone was found on this device.'
              : 'Could not access your camera or microphone.',
        );
      }
    };
    acquire();
    return () => {
      cancelled = true;
    };
  }, [isAudioCall, viewer.id, setSpeaking]);

  // ── Join the call ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch(`/api/group-calls/participants?callId=${call.id}`, {
          method: 'POST',
          cache: 'no-store',
        });
        if (!cancelled) await syncParticipants();
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call.id, syncParticipants]);

  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;

    for (const entry of peersMapRef.current.values()) {
      try {
        await sendSignal(entry.userId, 'bye', 'leave');
      } catch {
        // ignore
      }
      try {
        entry.pc.close();
      } catch {
        // ignore
      }
    }
    peersMapRef.current.clear();
    refreshPeers();

    try {
      await fetch(`/api/group-calls/participants?callId=${call.id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    onLeave();
  }, [call.id, sendSignal, refreshPeers, onLeave]);

  // Best-effort leave when the tab closes, so others do not wait for the reaper.
  useEffect(() => {
    const onUnload = () => {
      navigator.sendBeacon?.(`/api/group-calls/participants?callId=${call.id}&beacon=leave`);
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [call.id]);

  const endForEveryone = useCallback(async () => {
    if (!isHost) return;
    try {
      await fetch(`/api/group-calls?callId=${call.id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    await leave();
  }, [isHost, call.id, leave]);

  // Detect the host ending the call: the room disappears from the active list.
  useEffect(() => {
    if (isHost) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/group-calls/participants?callId=${call.id}`, { cache: 'no-store' });
        if (res.status === 410) setEnded(true);
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isHost, call.id]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      pushState({ isMuted: next });
      return next;
    });
  };

  const toggleCam = () => {
    setCamOff((c) => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      pushState({ isCameraOff: next });
      return next;
    });
  };

  const toggleHand = () => {
    setHandRaised((h) => {
      const next = !h;
      pushState({ handRaised: next });
      return next;
    });
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
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
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
      screenStreamRef.current = display;
      const track = display.getVideoTracks()[0];
      if (!track) return;

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
      try {
        const constraints: MediaStreamConstraints =
          kind === 'videoinput'
            ? { video: { deviceId: { exact: deviceId } }, audio: false }
            : { audio: { deviceId: { exact: deviceId } }, video: false };
        const fresh = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = kind === 'videoinput' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
        if (!newTrack) return;

        const stream = localStreamRef.current;
        if (stream) {
          const old = kind === 'videoinput' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
          if (old) {
            stream.removeTrack(old);
            old.stop();
          }
          stream.addTrack(newTrack);
          setLocalStream(new MediaStream(stream.getTracks()));
        }

        if (kind === 'videoinput') {
          cameraTrackRef.current = newTrack;
          if (!sharing) await replaceVideoTrack(newTrack);
        } else {
          for (const entry of peersMapRef.current.values()) {
            const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (sender) await sender.replaceTrack(newTrack).catch(() => {});
          }
          newTrack.enabled = !muted;
        }
        setShowDevices(false);
      } catch {
        setNotice('Could not switch device.');
        setTimeout(() => setNotice(''), 4000);
      }
    },
    [sharing, muted, replaceVideoTrack],
  );

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;
    setChatDraft('');
    try {
      await fetch('/api/group-calls/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, body }),
      });
    } catch {
      setNotice('Message could not be sent.');
      setTimeout(() => setNotice(''), 4000);
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
  const tileCount = peers.length + 1;
  const gridCols =
    tileCount <= 1 ? 'grid-cols-1' : tileCount <= 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';

  if (ended) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <PhoneOff className="h-10 w-10 text-red-500" aria-hidden="true" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">The host ended this call</h2>
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-400/30 dark:bg-gray-900 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live {isAudioCall ? 'audio' : 'video'} call
          </div>
          <h2 id="group-call-title" className="truncate text-base font-bold text-indigo-950 dark:text-white">
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
              className="inline-flex items-center gap-2 rounded-xl border border-red-600 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <PhoneOff className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">End for all</span>
            </button>
          )}
          <button
            type="button"
            onClick={leave}
            aria-label="Leave call"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Leave</span>
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

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col p-4">
          {!localReady && !error ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Requesting {isAudioCall ? 'microphone' : 'camera & microphone'}…
            </div>
          ) : (
            <div className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${gridCols}`}>
              <div className="aspect-video sm:aspect-auto">
                <VideoTile
                  stream={localStream}
                  mirror
                  muted
                  label={`${viewer.name} (you)`}
                  avatar={viewer.avatar}
                  speaking={speakingIds.has(viewer.id) && !muted}
                  isMuted={muted}
                  isCameraOff={camOff}
                  isSharing={sharing}
                  handRaised={handRaised}
                  audioOnly={isAudioCall}
                />
              </div>
              {peers.map((entry) => {
                const state = stateByUser.get(entry.userId);
                return (
                  <div key={entry.userId} className="aspect-video sm:aspect-auto">
                    <VideoTile
                      stream={entry.stream}
                      label={entry.name}
                      avatar={entry.avatar}
                      speaking={speakingIds.has(entry.userId)}
                      isMuted={state?.isMuted}
                      isCameraOff={state?.isCameraOff}
                      isSharing={state?.isSharing}
                      handRaised={Boolean(state?.handRaisedAt)}
                      connectionState={entry.connectionState}
                      audioOnly={isAudioCall}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {localReady && (
            <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                title={muted ? 'Unmute' : 'Mute'}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {muted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                <span className="hidden sm:inline">{muted ? 'Unmute' : 'Mute'}</span>
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
                  <span className="hidden sm:inline">{camOff ? 'Camera on' : 'Camera off'}</span>
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
                  <span className="hidden sm:inline">{sharing ? 'Stop share' : 'Share'}</span>
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
                <span className="hidden sm:inline">{handRaised ? 'Lower' : 'Raise'}</span>
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
                <span className="hidden sm:inline">Chat</span>
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
          <aside className="flex w-full max-w-xs shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
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
