'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Send, Video } from 'lucide-react';
import {
  ShareVideoError,
  deviceCanShareVideo,
  fetchShareVideo,
  formatMegabytes,
  sendsVideoAlone,
  videoSharePayload,
  type ShareVideo,
  type ShareVideoProgress,
} from '@/lib/share-video';

type Phase = 'idle' | 'preparing' | 'ready' | 'too_large';

/**
 * "Send the video": hands a post's video file to the device's share menu, so it
 * arrives in WhatsApp, Facebook or a text message as a video that plays there.
 *
 * Two presses, on purpose. A share menu may only be opened straight after a
 * press, and a download of any size outlives that; so the first press fetches
 * the file and the second, once it is ready, opens the menu.
 *
 * It renders nothing on a device that does not take a video file, fetches
 * nothing until it is pressed, and every way it can fail leaves one line that
 * points at the link, with the rest of the sheet as it was.
 */
export default function ShareVideoButton({
  video,
  caption,
  onSent,
}: {
  video: ShareVideo;
  /** The line that goes with the video: what it is, and its link on this site. */
  caption: string;
  /** After the share menu took the file. */
  onSent?: () => void;
}) {
  // The sheet is only ever rendered in a browser (it is portalled into
  // `document.body` after mount), so the device can be asked during render.
  const capable = useMemo(
    () => typeof navigator !== 'undefined' && deviceCanShareVideo(navigator, video),
    [video],
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ShareVideoProgress>({ received: 0, total: null });
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fetching = useRef<AbortController | null>(null);

  // A sheet closed part-way through stops paying for the download.
  useEffect(() => () => fetching.current?.abort(), []);

  if (!capable) return null;

  const prepare = async () => {
    const controller = new AbortController();
    fetching.current = controller;
    setError('');
    setNotice('');
    setProgress({ received: 0, total: null });
    setPhase('preparing');
    try {
      const ready = await fetchShareVideo(video, {
        signal: controller.signal,
        onProgress: (next) => { if (!controller.signal.aborted) setProgress(next); },
      });
      if (controller.signal.aborted) return;
      setFile(ready);
      setPhase('ready');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ShareVideoError && failure.reason === 'too_large') {
        setPhase('too_large');
        setError('This video is too large to send. Share the link instead.');
      } else {
        setPhase('idle');
        setError('The video could not be prepared. Share the link instead.');
      }
    } finally {
      if (fetching.current === controller) fetching.current = null;
    }
  };

  const cancel = () => {
    fetching.current?.abort();
    fetching.current = null;
    setPhase('idle');
  };

  const send = async () => {
    if (!file) return;
    setError('');
    setNotice('');
    const alone = sendsVideoAlone(navigator);
    // Both calls are made inside the press itself; neither waits on the other.
    const copied: Promise<boolean> = alone && caption && navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(caption).then(() => true, () => false)
      : Promise.resolve(false);
    try {
      await navigator.share(videoSharePayload(file, caption, alone));
      const captionCopied = await copied;
      setNotice(captionCopied
        ? 'Done. The caption and link are copied: paste them with the video.'
        : 'Done. Finish sending it in the app you chose.');
      onSent?.();
    } catch (failure) {
      // Closing the share menu without choosing is not a failure.
      if ((failure as { name?: string } | null)?.name === 'AbortError') return;
      setError('This device could not send the video. Share the link instead.');
    }
  };

  const percent = progress.total ? Math.min(100, Math.floor((progress.received / progress.total) * 100)) : null;
  const preparing = phase === 'preparing';
  const readyFile = phase === 'ready' ? file : null;
  const ready = readyFile !== null;

  const title = ready
    ? 'Send video'
    : preparing
      ? `Preparing video… ${percent !== null ? `${percent}%` : formatMegabytes(progress.received)}`
      : 'Send the video';
  const hint = readyFile
    ? `Ready · ${formatMegabytes(readyFile.size)}. Press to choose an app.`
    : preparing
      ? progress.total
        ? `${formatMegabytes(progress.received)} of ${formatMegabytes(progress.total)}`
        : 'Getting the video ready…'
      : 'So it plays inside WhatsApp, Facebook and other apps.';

  return (
    <div className="mb-4" data-share-video={phase}>
      {phase !== 'too_large' && (
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            disabled={preparing}
            aria-busy={preparing}
            onClick={ready ? send : prepare}
            className={`flex-1 min-w-0 flex items-center gap-3 p-3 rounded-xl border text-left transition-colors disabled:cursor-progress ${
              ready
                ? 'border-blue-600 bg-blue-600 hover:bg-blue-700 text-white'
                : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'
            }`}
          >
            <span className={`p-2.5 rounded-xl shrink-0 ${ready ? 'bg-white/20 text-white' : 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'}`}>
              {preparing ? <LoaderCircle className="w-5 h-5 animate-spin" /> : ready ? <Send className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block font-semibold ${ready ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{title}</span>
              <span className={`block text-xs ${ready ? 'text-blue-50' : 'text-gray-500 dark:text-gray-400'}`}>{hint}</span>
              {preparing && (
                <span
                  role="progressbar"
                  aria-label="Preparing video"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  {...(percent !== null ? { 'aria-valuenow': percent } : {})}
                  className="mt-2 block h-1.5 rounded-full bg-blue-200/70 dark:bg-blue-950 overflow-hidden"
                >
                  <span
                    className={`block h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-[width] ${percent === null ? 'animate-pulse' : ''}`}
                    style={{ width: `${percent ?? 100}%` }}
                  />
                </span>
              )}
            </span>
          </button>
          {preparing && (
            <button
              type="button"
              onClick={cancel}
              className="shrink-0 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className={`text-sm font-medium ${notice || error ? (phase === 'too_large' ? '' : 'mt-2') : 'sr-only'} ${error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
        {error || notice}
      </p>
    </div>
  );
}
