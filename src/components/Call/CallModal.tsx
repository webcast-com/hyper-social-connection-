'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Headphones,
  LoaderCircle,
  Mic,
  PhoneCall,
  Plus,
  Radio,
  Video,
  X,
} from 'lucide-react';

type CallType = 'video' | 'audio';

type GroupCall = {
  id: number;
  title: string;
  description: string | null;
  roomUrl: string;
  createdAt: string;
  creator: {
    id: number;
    name: string;
    avatar: string | null;
  };
};

function dailyEmbedUrl(roomUrl: string, callType: CallType) {
  try {
    const url = new URL(roomUrl);
    const isDaily = url.hostname === 'daily.co' || url.hostname.endsWith('.daily.co');
    if (url.protocol !== 'https:' || !isDaily) return null;

    url.searchParams.set('embed', 'true');
    url.searchParams.set('showLeaveButton', 'true');
    url.searchParams.set('showFullscreenButton', 'true');
    if (callType === 'audio') url.searchParams.set('startVideoOff', 'true');
    return url.toString();
  } catch {
    return null;
  }
}

export default function CallModal({
  groupId,
  groupName,
}: {
  groupId: number;
  groupName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [callType, setCallType] = useState<CallType>('video');
  const [activeCall, setActiveCall] = useState<GroupCall | null>(null);
  const [roomCall, setRoomCall] = useState<GroupCall | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setRoomCall(null);
        setError('');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setRoomCall(null);
    setError('');
  };

  const showModal = async () => {
    setOpen(true);
    setError('');
    setLoadingCalls(true);

    try {
      const response = await fetch(`/api/group-calls?groupId=${groupId}&active=true`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        | { calls?: GroupCall[]; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error || 'Could not check active calls.');
      setActiveCall(payload?.calls?.[0] || null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoadingCalls(false);
    }
  };

  const startCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStarting(true);
    setError('');

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/group-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          callType,
          title: String(form.get('title') || ''),
          description: String(form.get('description') || ''),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { call?: GroupCall; error?: string }
        | null;
      if (!response.ok || !payload?.call) {
        throw new Error(payload?.error || 'Could not start the call.');
      }

      setActiveCall(payload.call);
      setRoomCall(payload.call);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const embedUrl = roomCall ? dailyEmbedUrl(roomCall.roomUrl, callType) : null;

  return (
    <>
      <button
        type="button"
        onClick={showModal}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <Video className="h-4 w-4" aria-hidden="true" />
        Start Call
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/75 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-call-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeModal();
          }}
        >
          <div className={`relative w-full overflow-hidden border border-indigo-200 bg-white shadow-2xl dark:border-indigo-400/40 dark:bg-gray-900 ${roomCall ? 'h-[min(92vh,860px)] max-w-6xl rounded-2xl' : 'max-w-xl rounded-3xl'}`}>
            {roomCall ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-4 border-b border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-400/30 dark:bg-gray-900 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                      <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Live group call
                    </div>
                    <h2 id="group-call-title" className="truncate text-base font-bold text-indigo-950 dark:text-white">
                      {roomCall.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Leave call"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Leave</span>
                  </button>
                </div>
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={`${roomCall.title} video call`}
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                    className="min-h-0 flex-1 border-0 bg-gray-950"
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-700 dark:text-red-300">
                    This call has an invalid room URL.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-6 py-6 text-white sm:px-8">
                  <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Close call dialog"
                    className="absolute right-4 top-4 rounded-full p-2 text-indigo-100 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                    <Video className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 id="group-call-title" className="relative mt-4 text-2xl font-bold">
                    Call {groupName}
                  </h2>
                  <p className="relative mt-1 text-sm text-indigo-100">
                    Start a video or audio room and invite everyone in the group.
                  </p>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-6 py-5 sm:px-8">
                  {loadingCalls ? (
                    <div className="mb-5 flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-950/40 dark:text-indigo-200">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Checking for a live call…
                    </div>
                  ) : activeCall ? (
                    <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-400/40 dark:bg-indigo-950/40">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live now
                      </div>
                      <div className="mt-1 font-bold text-indigo-950 dark:text-white">{activeCall.title}</div>
                      <div className="mt-0.5 text-xs text-indigo-800 dark:text-indigo-200">
                        Started by {activeCall.creator.name}
                      </div>
                      {activeCall.description && (
                        <p className="mt-2 text-sm text-indigo-900/80 dark:text-indigo-100/80">{activeCall.description}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => setRoomCall(activeCall)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                      >
                        <PhoneCall className="h-4 w-4" aria-hidden="true" /> Join live call
                      </button>
                    </div>
                  ) : null}

                  <form onSubmit={startCall} className="space-y-4">
                    {activeCall && (
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                        Or start a new room
                        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                      </div>
                    )}

                    <fieldset>
                      <legend className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">Call type</legend>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setCallType('video')}
                          aria-pressed={callType === 'video'}
                          className={`rounded-2xl border p-3 text-left transition-colors ${callType === 'video' ? 'border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-600/15 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-white' : 'border-gray-200 text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400'}`}
                        >
                          <Video className="mb-2 h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                          <span className="block text-sm font-bold">Video</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Camera and microphone</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCallType('audio')}
                          aria-pressed={callType === 'audio'}
                          className={`rounded-2xl border p-3 text-left transition-colors ${callType === 'audio' ? 'border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-600/15 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-white' : 'border-gray-200 text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400'}`}
                        >
                          <Headphones className="mb-2 h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                          <span className="block text-sm font-bold">Audio</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Microphone only</span>
                        </button>
                      </div>
                    </fieldset>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-800 dark:text-gray-100">Title</span>
                      <input
                        name="title"
                        maxLength={120}
                        placeholder={`${groupName} call`}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-800 dark:text-gray-100">Description <span className="font-normal text-gray-400">(optional)</span></span>
                      <textarea
                        name="description"
                        maxLength={500}
                        rows={2}
                        placeholder="What will you talk about?"
                        className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400"
                      />
                    </label>

                    {error && (
                      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={starting}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {starting ? (
                        <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Creating secure room…</>
                      ) : (
                        <><Plus className="h-4 w-4" aria-hidden="true" /> Start {callType} call</>
                      )}
                    </button>
                    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
                      <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Daily.co will ask for device permission when you join.
                    </p>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
