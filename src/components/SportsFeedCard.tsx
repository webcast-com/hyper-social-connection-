'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart2,
  MessageCircle,
  Radio,
  Send,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { matchHref } from '@/lib/espn-match';
import { scoreCardLabel, scoreCardTarget, usesScoreCard } from '@/lib/score-card';
import { winningSide } from '@/lib/featured-match';
import SportsMatchFace, { MATCH_CARD, MATCH_FRAME, matchFaceTone } from './SportsMatchFace';
import SportsScoreCard from './SportsScoreCard';
import { matchPollOptions, type SportsEvent, type SportsPrediction } from '@/lib/sports';
import { SPORT_EMOJI, SPORT_LABELS } from '@/lib/sports-catalog';
import { createPost } from '@/app/actions';
import { ShareContentSheet } from './ShareSheets';

type ActionMode = 'comment' | 'poll';

function statusStyles(status: SportsEvent['status']) {
  if (status === 'live') return 'bg-red-500 text-white shadow-red-500/25';
  if (status === 'final') return 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300';
}

function statusLabel(event: SportsEvent) {
  if (event.source === 'demo') return 'Sample fixture';
  if (event.status === 'live') return `LIVE ${event.detail || ''}`.trim();
  if (event.status === 'final') return event.detail || 'Final';
  return event.detail || 'Upcoming';
}

function matchLine(event: SportsEvent) {
  if (event.race) return event.race.title;
  const score = event.status === 'upcoming'
    ? 'vs'
    : `${event.away.score ?? '–'}–${event.home.score ?? '–'}`;
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

function modeTitle(mode: ActionMode) {
  if (mode === 'comment') return 'Comment on this match';
  return 'Create a match poll';
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
  const [pollOptions, setPollOptions] = useState<string[]>(() => matchPollOptions(event));
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSignedIn = !!currentUser?.id;
  // Basketball and American football are drawn as the NFL & basketball
  // dashboard's score card. Football and every other fixture are drawn as the
  // sports board's own match card (`SportsMatchFace` in its frame), so a match
  // looks the same in the feed as it does on /sports. Either card carries its
  // own competition, status, clock and venue, so none of them is repeated
  // beside it, and the card itself is the one destination.
  const scoreCard = usesScoreCard(event);
  // The board's rule for which fixtures have a match page (`SportsEventCard`).
  const matchPage = event.source === 'espn' && event.sport !== 'motorsport' && !event.race && event.details
    ? matchHref(event.details) : null;
  const bodyHref = scoreCard ? scoreCardTarget(event) : matchPage ?? '/sports';
  const showScore = event.status !== 'upcoming';
  const winner = winningSide(event);
  const predictionLabel = prediction
    ? `${prediction.prediction}${prediction.winOdds ? ` @ ${prediction.winOdds}` : ''}`
    : null;
  // The board card's own words for its link, plus the prediction the link also wraps.
  const matchPageLabel = matchPage
    ? `Open ${event.away.name}${showScore ? ` (${event.away.score ?? 'not reported'})` : ''} vs ${event.home.name}${showScore ? ` (${event.home.score ?? 'not reported'})` : ''} match details${predictionLabel ? `. Prediction: ${predictionLabel}` : ''}`
    : undefined;

  const placeholder = useMemo(() => {
    if (mode === 'comment') return 'Add your take on this match...';
    return `Ask a question, e.g. Who wins: ${matchLine(event)}?`;
  }, [event, mode]);

  const openMode = (nextMode: ActionMode) => {
    setMode(nextMode);
    setError('');
    if (nextMode === 'poll' && !text.trim()) {
      setText(`Who wins: ${matchLine(event)}?`);
      setPollOptions(matchPollOptions(event));
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
      setPollOptions(matchPollOptions(event));
      router.refresh();
    });
  };

  return (
    <article className="overflow-hidden rounded-xl border border-amber-100 bg-white shadow transition-all dark:border-amber-900/50 dark:bg-gray-800">
      <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-blue-50 px-4 py-2 dark:border-amber-900/50 dark:from-amber-950/40 dark:via-slate-900 dark:to-blue-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {/* The sport's own emoji, not one trophy for every game. The words beside
                it already name the sport, so the emoji is decoration. */}
            <div aria-hidden="true" data-sport-emoji={event.sport} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-[22px] leading-none shadow-sm ring-1 ring-black/5 dark:from-slate-700 dark:to-slate-900 dark:ring-white/10">
              {SPORT_EMOJI[event.sport] ?? SPORT_EMOJI.other}
            </div>
            <div className="min-w-0">
              <Link href="/sports" className="block truncate text-sm font-bold text-gray-900 hover:underline dark:text-white">
                Hyper Sports
              </Link>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {SPORT_LABELS[event.sport]} match · in{' '}
                <Link href="/sports" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  Sports
                </Link>
              </div>
            </div>
          </div>
          {/* The board's match card says its own status, so the header does not say it twice. */}
          {scoreCard && (
            <span className={`max-w-full break-words rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusStyles(event.source === 'demo' ? 'upcoming' : event.status)}`}>
              {event.status === 'live' && event.source !== 'demo' && <Radio className="mr-1 inline h-3 w-3 animate-pulse" />}
              {statusLabel(event)}
            </span>
          )}
        </div>
      </div>

      <Link
        href={bodyHref}
        prefetch={bodyHref === '/sports' ? undefined : false}
        aria-label={scoreCard ? scoreCardLabel(event) : matchPageLabel}
        className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        {scoreCard ? <SportsScoreCard event={event} /> : (
          <div data-match-card className={MATCH_CARD}>
            <div className={MATCH_FRAME}>
              <SportsMatchFace event={event} tone={matchFaceTone(event)} linked={!!matchPage}
                loser={winner ? (winner === 'home' ? 'away' : 'home') : null} />
            </div>
          </div>
        )}

        {predictionLabel && (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
            🔮 Prediction: {predictionLabel}
            {prediction?.competition && <span className="font-semibold opacity-75"> · {prediction.competition}</span>}
          </div>
        )}
      </Link>

      <div className="grid grid-cols-3 border-t border-gray-100 px-2 py-1 text-sm dark:border-gray-700">
        <button
          type="button"
          onClick={() => openMode('comment')}
          disabled={!isSignedIn}
          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg py-2 text-xs sm:gap-2 sm:text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          onClick={() => openMode('poll')}
          disabled={!isSignedIn}
          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg py-2 text-xs sm:gap-2 sm:text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <BarChart2 className="h-4 w-4" />
          <span>Poll</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode(null); setShowShare(true); }}
          aria-haspopup="dialog"
          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg py-2 text-xs sm:gap-2 sm:text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
      </div>

      {!isSignedIn && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Sign in to comment, create polls, or share matches on Hyper.
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
                    className="min-w-0 w-full flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== index))}
                      className="shrink-0 min-h-11 min-w-11 rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
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
              {isPending ? 'Posting…' : mode === 'poll' ? 'Post poll' : 'Post comment'}
            </button>
          </div>
        </div>
      )}

      {/* The share sheet — the one a profile opens. */}
      {showShare && (
        <ShareContentSheet
          subject={{
            noun: 'match',
            title: matchLine(event),
            subtitle: `${event.leagueName} · ${statusLabel(event)}`,
            image: event.home.logo || event.away.logo || null,
            link: event.source === 'espn' && !event.race && event.details ? matchHref(event.details) : bodyHref,
            text: `${matchLine(event)} — ${event.leagueName} on Hyper`,
            feedHint: 'Posts this match to your followers, with your note if you add one.',
          }}
          compose={(note) => matchPostText(event, note, prediction)}
          canShareInternally={isSignedIn}
          onClose={() => setShowShare(false)}
        />
      )}
    </article>
  );
}
