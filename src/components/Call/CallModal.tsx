'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, LoaderCircle, Mic, PhoneOff, Radio, Video, X } from 'lucide-react';
import WebRTCRoom from './WebRTCRoom';

type CallType = 'video' | 'audio';
type Viewer = { id: number; name: string; avatar: string | null } | null;

type GroupCall = {
  id: number;
  title: string;
  description: string | null;
  roomUrl: string;
  callType?: CallType;
  createdAt: string;
  participantCount?: number;
  creator: { id: number; name: string; avatar: string | null };
};

/**
 * Group call modal.
 *
 * This is the shell (lobby → room) around the native WebRTC transport in
 * `WebRTCRoom`: starting/joining, call type, and the invite link. All peer
 * connections, chat and screen sharing live in WebRTCRoom — this component
 * only decides *which* call is on screen.
 *
 * Controlled by the parent (`StartCallButton`) via `isOpen` / `setIsOpen` so
 * the group page can stay a server component.
 */
export function CallModal({
  groupId,
  groupName,
  viewer,
  isOpen,
  setIsOpen,
}: {
  groupId: number;
  groupName: string;
  viewer: Viewer;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  // `null` while the first load is in flight, then the list of live calls.
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [title, setTitle] = useState('');
  const [liveCalls, setLiveCalls] = useState<GroupCall[] | null>(null);
  const [roomCall, setRoomCall] = useState<GroupCall | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLiveCalls = useCallback(async () => {
    try {
      const response = await fetch(`/api/group-calls?groupId=${groupId}&active=true`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        | { calls?: GroupCall[]; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error || 'Could not check active calls.');
      setLiveCalls(payload?.calls ?? []);
    } catch (requestError) {
      setLiveCalls([]);
      setError((requestError as Error).message);
    }
  }, [groupId]);

  // Load the lobby's list of live calls. The component is mounted fresh each
  // time it opens (see StartCallButton), so state starts clean without
  // resetting it from an effect.
  useEffect(() => {
    if (!isOpen) return;
    // Deferred a microtask so the resulting state writes land outside the
    // effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(loadLiveCalls);
  }, [isOpen, loadLiveCalls]);

  // Escape closes the modal and body scroll stays locked while it is open.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setRoomCall(null);
        setError('');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, setIsOpen]);

  const startCall = async () => {
    setStarting(true);
    setError('');
    try {
      const response = await fetch('/api/group-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, callType, title: title.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { call?: GroupCall; error?: string }
        | null;
      if (!response.ok || !payload?.call) {
        throw new Error(payload?.error || 'Could not start the call.');
      }
      setRoomCall(payload.call);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const copyInvite = async () => {
    const link = `${window.location.origin}/groups/${groupId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(link);
    }
  };

  const leaveRoom = () => {
    setRoomCall(null);
    setError('');
    setLiveCalls(null);
    void loadLiveCalls();
  };

  if (!isOpen) return null;

  const liveCall = liveCalls?.[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-call-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setIsOpen(false);
      }}
    >
      <div
        className={`relative w-full overflow-hidden border border-indigo-200 bg-white shadow-2xl dark:border-indigo-400/40 dark:bg-gray-900 ${
          roomCall ? 'h-[min(92vh,860px)] max-w-6xl rounded-2xl' : 'max-w-xl rounded-3xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h2
            id="group-call-title"
            className="flex items-center gap-2 truncate text-base font-extrabold text-gray-900 dark:text-white"
          >
            {roomCall?.callType === 'audio' ? (
              <Mic className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            ) : (
              <Video className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            )}
            {groupName} Call
          </h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
            aria-label="Close call dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {roomCall ? (
          <WebRTCRoom
            call={roomCall}
            viewer={{ id: viewer?.id ?? 0, name: viewer?.name ?? 'You', avatar: viewer?.avatar ?? null }}
            callType={roomCall.callType ?? callType}
            onLeave={leaveRoom}
          />
        ) : (
          <div>
            {/* Lobby */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-6 py-6 text-white sm:px-8">
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
              <h3 className="text-lg font-bold">Start a group call</h3>
              <p className="mt-1 max-w-md text-sm text-indigo-100">
                Members of {groupName} can join instantly. Calls are peer-to-peer — no third-party
                service.
              </p>
            </div>

            <div className="space-y-4 p-6">
              {/* Call type */}
              <div className="grid grid-cols-2 gap-2">
                {(['video', 'audio'] as CallType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCallType(type)}
                    aria-pressed={callType === type}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      callType === type
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-200'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {type === 'video' ? (
                      <Video className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Mic className="h-4 w-4" aria-hidden="true" />
                    )}
                    {type === 'video' ? 'Video' : 'Audio only'}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Call title (optional)
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder={`${groupName} call`}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>

              {/* Live call to join */}
              {liveCalls === null ? (
                <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking for a live call…
                </p>
              ) : liveCall ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    <Radio className="h-4 w-4" aria-hidden="true" />
                    {liveCall.title} is live
                    {liveCall.participantCount ? ` · ${liveCall.participantCount} in the call` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRoomCall(liveCall)}
                    className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Join now
                  </button>
                </div>
              ) : null}

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200"
                >
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={startCall}
                disabled={starting}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {starting ? 'Starting…' : liveCall ? 'Start a new call anyway' : 'Start call'}
              </button>
            </div>
          </div>
        )}

        {/* Footer: invite + leave (ours) */}
        {roomCall && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={copyInvite}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4" aria-hidden="true" /> Leave
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CallModal;
