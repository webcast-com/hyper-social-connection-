'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  CalendarClock,
  MapPin,
  MessageCircle,
  Radio,
  Send,
  Share2,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import type { SportsEvent, SportsPrediction } from '@/lib/sports';
import { createPost } from '@/app/actions';

type ActionMode = 'comment' | 'share' | 'poll';

function statusStyles(status: SportsEvent['status']) {
  if (status === 'live') return 'bg-red-500 text-white shadow-red-500/25';
  if (status === 'final') return 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300';
}

function statusLabel(event: SportsEvent) {
  if (event.status === 'live') return `LIVE ${event.detail || ''}`.trim();
  if (event.status === 'final') return event.detail || 'Final';
  return event.detail || 'Upcoming';
}

function matchLine(event: SportsEvent) {
  const score = event.status === 'upcoming'
    ? 'vs'
    : `${event.away.score ?? 0}–${event.home.score ?? 0}`;
  return `${event.away.short || event.away.name} ${score} ${event.home.short || event.home.name}`;
}

function matchPostText(event: SportsEvent, note?: string, prediction?: SportsPrediction | null) {
  const parts = [
    `🏆 ${matchLine(event)}`,
    `${event.leagueName} · ${statusLabel(event)}`,
    prediction ? `🔮 Prediction: ${prediction.prediction}${prediction.winOdds ? ` @ ${prediction.winOdds}` : ''}` : '',
    event.venue ? `📍 ${event.venue}` : '',
    note?.trim() ? `\n${note.trim()}` : '',
    '\n#Sports #MatchDay',
  ].filter(Boolean);
  return parts.join('\n');
}

function TeamBadge({ team, align = 'left' }: { team: SportsEvent['home']; align?: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === 'right' ? 'justify-end text-right' : ''}`}>
      {align === 'right' && (
        <span className="truncate text-sm font-black text-gray-900 dark:text-white">{team.short || team.name}</span>
      )}
      {team.logo ? (
        <img src={team.logo} alt="" className="h-9 w-9 rounded-full bg-white object-contain p-1 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-black text-white shadow-sm">
          {(team.short || team.name).slice(0, 2).toUpperCase()}
        </div>
      )}
      {align === 'left' && (
        <span className="truncate text-sm font-black text-gray-900 dark:text-white">{team.short || team.name}</span>
      )}
    </div>
  );
}

function modeTitle(mode: ActionMode) {
  if (mode === 'comment') return 'Comment on this match';
  if (mode === 'poll') return 'Create a match poll';
  return 'Share this match';
}

export default function SportsFeedCard({
  event,
  prediction,
  currentUser,
}: {
  event: SportsEvent;
  prediction?: SportsPrediction | null;
  currentUser?: any;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [text, setText] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>([
    event.away.short || event.away.name,
    event.home.short || event.home.name,
  ]);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const isSignedIn = !!currentUser?.id;
  const score = event.status === 'upcoming'
    ? 'vs'
    : `${event.away.score ?? 0}–${event.home.score ?? 0}`;
  const predictionLabel = prediction
    ? `${prediction.prediction}${prediction.winOdds ? ` @ ${prediction.winOdds}` : ''}`
    : null;

  const placeholder = useMemo(() => {
    if (mode === 'comment') return 'Add your take on this match...';
    if (mode === 'poll') return `Ask a question, e.g. Who wins: ${matchLine(event)}?`;
    return 'Say something before sharing, or leave empty to share the match.';
  }, [event, mode]);

  const openMode = (nextMode: ActionMode) => {
    setMode(nextMode);
    setError('');
    if (nextMode === 'poll' && !text.trim()) {
      setText(`Who wins: ${matchLine(event)}?`);
      setPollOptions([event.away.short || event.away.name, 'Draw', event.home.short || event.home.name]);
    } else if (nextMode !== 'poll') {
      setText('');
    }
  };

  const submit = () => {
    if (!mode || !isSignedIn || isPending) return;
    setError('');

    const data = new FormData();
    data.set('content', matchPostText(event, text, prediction));

    if (mode === 'poll') {
      const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (validOptions.length < 2) {
        setError('Add at least two poll options.');
        return;
      }
      data.set('hasPoll', 'true');
      validOptions.slice(0, 4).forEach((option, index) => {
        data.set(`pollOption${index + 1}`, option);
      });
      data.set('pollDurationDays', '1');
    }

    startTransition(async () => {
      await createPost(data);
      setMode(null);
      setText('');
      setPollOptions([event.away.short || event.away.name, event.home.short || event.home.name]);
      router.refresh();
    });
  };

  return (
    <article className="overflow-hidden rounded-xl border border-amber-100 bg-white shadow transition-all dark:border-amber-900/50 dark:bg-gray-800">
      <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-blue-50 px-4 py-2 dark:border-amber-900/50 dark:from-amber-950/40 dark:via-slate-900 dark:to-blue-950/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-sm">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <Link href="/sports" className="block truncate text-sm font-bold text-gray-900 hover:underline dark:text-white">
                Hyper Sports
              </Link>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                Featured match · in{' '}
                <Link href="/sports" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  Sports
                </Link>
              </div>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusStyles(event.status)}`}>
            {event.status === 'live' && <Radio className="mr-1 inline h-3 w-3 animate-pulse" />}
            {statusLabel(event)}
          </span>
        </div>
      </div>

      <Link href="/sports" className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          <span className="truncate">{event.leagueName}</span>
          <span suppressHydrationWarning>{new Date(event.startAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>

        <div className="rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100 dark:bg-slate-900/60 dark:ring-slate-700/70">
          <div className="flex items-center gap-3">
            <TeamBadge team={event.away} />
            <div className="rounded-2xl bg-white px-3 py-2 text-center text-lg font-black tabular-nums text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700">
              {score}
            </div>
            <TeamBadge team={event.home} align="right" />
          </div>
        </div>

        {predictionLabel && (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
            🔮 Prediction: {predictionLabel}
            {prediction?.competition && <span className="font-semibold opacity-75"> · {prediction.competition}</span>}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>{new Date(event.startAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          {event.venue && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </span>
          )}
        </div>
      </Link>

      <div className="grid grid-cols-3 border-t border-gray-100 px-2 py-1 text-sm dark:border-gray-700">
        <button
          type="button"
          onClick={() => openMode('comment')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          onClick={() => openMode('poll')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <BarChart2 className="h-4 w-4" />
          <span>Poll</span>
        </button>
        <button
          type="button"
          onClick={() => openMode('share')}
          disabled={!isSignedIn}
          className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
      </div>

      {!isSignedIn && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Sign in to comment, create polls, or share matches.
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
              aria-label="Close match composer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={mode === 'poll' ? 2 : 3}
            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />

          {mode === 'poll' && (
            <div className="mt-3 space-y-2">
              {pollOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[index] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${index + 1}`}
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== index))}
                      className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      aria-label="Remove poll option"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Add option
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {isPending ? 'Posting…' : mode === 'poll' ? 'Post poll' : mode === 'comment' ? 'Post comment' : 'Share match'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
