'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, PhoneCall, Users, Video, VideoOff } from 'lucide-react';

type CallType = 'video' | 'audio';
type Viewer = { id: number; name: string; avatar: string | null };

type CallInfo = {
  id: number;
  title: string;
  description: string | null;
  roomUrl: string;
  creator: { id: number; name: string; avatar: string | null };
};

type Participant = { userId: number; name: string; avatar: string | null };

type Signal = { id: number; callId: number; fromId: number; toId: number | null; kind: string; payload: string };

type PeerEntry = {
  userId: number;
  name: string;
  avatar: string | null;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  candidates: RTCIceCandidateInit[];
  connected: boolean;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function VideoTile({
  stream,
  mirror,
  muted,
  label,
  avatar,
}: {
  stream: MediaStream | null;
  mirror?: boolean;
  muted?: boolean;
  label: string;
  avatar: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-950 shadow-lg ring-1 ring-gray-800">
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={label} className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-2xl font-bold text-white">
              {label?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
        {label}
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
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersMapRef = useRef<Map<number, PeerEntry>>(new Map());
  const lastSignalIdRef = useRef(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [error, setError] = useState('');
  const [peers, setPeers] = useState<PeerEntry[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const leavingRef = useRef(false);

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
      };
      peersMapRef.current.set(participant.userId, entry);

      const localStream = localStreamRef.current;
      if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(participant.userId, 'ice', JSON.stringify(event.candidate.toJSON())).catch(() => {});
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          entry.stream = stream;
          refreshPeers();
        }
      };

      pc.onconnectionstatechange = () => {
        entry.connected = pc.connectionState === 'connected';
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
    [viewer.id, sendSignal, refreshPeers],
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
    [createPeer, sendSignal, addCandidate, flushCandidates, refreshPeers],
  );

  // ── Participant sync: connect to peers we should initiate to ─────────────
  const syncParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-calls/participants?callId=${call.id}`, { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { participants?: Participant[] } | null;
      if (!res.ok || !data?.participants) return;
      setParticipantCount(data.participants.length);

      for (const participant of data.participants) {
        if (participant.userId === viewer.id) continue;
        // We are the initiator only when we have the lower id; otherwise the
        // remote (lower id) peer sends us an offer which we answer.
        const asInitiator = viewer.id < participant.userId;
        if (!peersMapRef.current.has(participant.userId)) {
          await createPeer(participant, asInitiator);
        }
      }
    } catch {
      // ignore transient failures
    }
  }, [call.id, viewer.id, createPeer]);

  // ── Poll loop for signals + participants ─────────────────────────────────
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
      await syncParticipants();
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [call.id, handleSignal, syncParticipants]);

  // ── Acquire local media ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setLocalReady(true);
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
  }, [callType]);

  // ── Join the call as a participant ───────────────────────────────────────
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
        await sendSignal(entry.userId, 'bye', '');
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

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    onLeave();
  }, [call.id, sendSignal, refreshPeers, onLeave]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  const toggleCam = () => {
    setCamOff((c) => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-400/30 dark:bg-gray-900 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live group call
          </div>
          <h2 id="group-call-title" className="truncate text-base font-bold text-indigo-950 dark:text-white">
            {call.title}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {participantCount} {participantCount === 1 ? 'person' : 'people'} in the call
          </div>
        </div>
        <button
          type="button"
          onClick={leave}
          aria-label="Leave call"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {!localReady && !error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Requesting camera & microphone…
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="aspect-video sm:aspect-auto">
              <VideoTile
                stream={localStream}
                mirror
                muted
                label={`${viewer.name} (you)`}
                avatar={viewer.avatar}
              />
            </div>
            {peers.map((entry) => (
              <div key={entry.userId} className="aspect-video sm:aspect-auto">
                <VideoTile
                  stream={entry.stream}
                  label={entry.name}
                  avatar={entry.avatar}
                />
              </div>
            ))}
          </div>
        )}

        {localReady && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              {muted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            {callType === 'video' && (
              <button
                type="button"
                onClick={toggleCam}
                aria-pressed={camOff}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                {camOff ? <VideoOff className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
                {camOff ? 'Camera on' : 'Camera off'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
