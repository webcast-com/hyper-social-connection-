'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { BarChart2, CalendarClock, MessageCircle, Send, Share2, Sparkles, Trophy, X } from 'lucide-react';
import type { SportsPrediction } from '@/lib/sports';
import { formatPredictionKickoff } from '@/lib/sports';
import { createPost } from '@/app/actions';

type Mode = 'comment' | 'poll' | 'share';

function predictionPostText(prediction: SportsPrediction, note?: string, asPoll = false) {
  const parts = [
    `🔮 Match prediction: ${prediction.homeTeam} vs ${prediction.awayTeam}`,
    `${prediction.competition || prediction.federation} · ${prediction.market}`,
    `Pick: ${prediction.prediction}${prediction.winOdds ? ` @ ${prediction.winOdds}` : ''}`,
    note?.trim() ? `\n${note.trim()}` : '',
    asPoll ? '\nWho do you think wins?' : '',
    '\n#Sports #Predictions #MatchDay',
  ].filter(Boolean);
  return parts.join('\n');
}

function modeTitle(mode: Mode) {
  if (mode === 'poll') return 'Create a prediction poll';
  if (mode === 'comment') return 'Comment on this prediction';
  return 'Share this prediction';
}

export default function SportsPredictionFeedCard({
  prediction,
  currentUser,
}: {
  prediction: SportsPrediction;
  currentUser?: any;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const isSignedIn = !!currentUser?.id;
  const submit = () => {
    if (!mode || !isSignedIn || isPending) return;
    const formData = new FormData();
    formData.set('content', predictionPostText(prediction, note, mode === 'poll'));
    if (mode === 'poll') {
      formData.set('hasPoll', 'true');
      formData.set('pollOption1', prediction.homeTeam);
      formData.set('pollOption2', 'Draw');
      formData.set('pollOption3', prediction.awayTeam);
      formData.set('pollDurationDays', '1');
    }

    startTransition(async () => {
      await createPost(formData);
      setMode(null);
      setNote('');
    });
  };

  return (
    <article className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow transition-all dark:border-violet-900/50 dark:bg-gray-800">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-2 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-fuchsia-950/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Link href="/sports/predictions" className="block truncate text-sm font-bold text-gray-900 hover:underline dark:text-white">
                Hyper Predictions
              </Link>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                Football pick · in{' '}
                <Link href="/sports/predictions" className="font-semibold text-violet-600 hover:underline dark:text-violet-300">
                  Predictions
                </Link>
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
            Pick {prediction.prediction}
          </span>
        </div>
      </div>

      <Link href="/sports/predictions" className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          <span className="truncate">{prediction.competition || prediction.federation}</span>
          <span>RapidAPI</span>
        </div>

        <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/50">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Home</div>
              <div className="truncate text-sm font-black text-gray-900 dark:text-white">{prediction.homeTeam}</div>
            </div>
            <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900/60">
              <div className="text-[10px] font-bold uppercase text-violet-500">Prediction</div>
              <div className="text-lg font-black text-violet-700 dark:text-violet-200">{prediction.prediction}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Away</div>
              <div className="truncate text-sm font-black text-gray-900 dark:text-white">{prediction.awayTeam}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            {prediction.winOdds ? `Odds ${prediction.winOdds}` : 'Odds n/a'}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>{formatPredictionKickoff(prediction.startAt)}</span>
          </span>
        </div>
      </Link>

      <div className="grid grid-cols-3 border-t border-gray-100 px-2 py-1 text-sm dark:border-gray-700">
        <button
          type="button"
          onClick={() => setMode('comment')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('poll')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <BarChart2 className="h-4 w-4" />
          <span>Poll</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('share')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
      </div>

      {!isSignedIn && (
        <div className="border-t border-violet-100 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
          Sign in to comment, poll, or share predictions.
        </div>
      )}

      {mode && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 dark:text-white">{modeTitle(mode)}</h3>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="Close prediction composer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'poll' ? 'Ask your followers what they think...' : 'Add your take before posting...'}
            rows={3}
            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {isPending ? 'Posting…' : mode === 'poll' ? 'Post poll' : mode === 'comment' ? 'Post comment' : 'Share prediction'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
