'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart2, CalendarClock, Send, Share2, Sparkles, Trophy } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import type { SportsBoard, SportsPrediction } from '@/lib/sports';
import { formatPredictionKickoff } from '@/lib/sports';
import { createPost } from '@/app/actions';

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

function PredictionCard({ prediction }: { prediction: SportsPrediction }) {
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const publish = (kind: 'share' | 'poll') => {
    const data = new FormData();
    data.set('content', predictionPostText(prediction, note, kind === 'poll'));
    if (kind === 'poll') {
      data.set('hasPoll', 'true');
      data.set('pollOption1', prediction.homeTeam);
      data.set('pollOption2', 'Draw');
      data.set('pollOption3', prediction.awayTeam);
      data.set('pollDurationDays', '1');
    }
    startTransition(async () => {
      await createPost(data);
      setNote('');
    });
  };

  return (
    <article className="rounded-3xl border border-violet-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-violet-900/50 dark:bg-gray-800/90">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">
            <Sparkles className="h-3.5 w-3.5" /> Prediction
          </div>
          <h2 className="text-base font-black text-gray-900 dark:text-white">
            {prediction.homeTeam} <span className="text-gray-400">vs</span> {prediction.awayTeam}
          </h2>
          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {prediction.competition || prediction.federation} · {prediction.market}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-3 py-2 text-center text-white shadow-sm">
          <div className="text-[10px] font-bold uppercase opacity-80">Pick</div>
          <div className="text-sm font-black">{prediction.prediction}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-violet-50 p-3 text-xs ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/50">
        <div>
          <div className="font-bold uppercase tracking-wide text-violet-500">Odds</div>
          <div className="mt-1 font-black text-gray-900 dark:text-white">{prediction.winOdds || 'n/a'}</div>
        </div>
        <div>
          <div className="font-bold uppercase tracking-wide text-violet-500">Kickoff</div>
          <div className="mt-1 flex items-center gap-1 font-black text-gray-900 dark:text-white" suppressHydrationWarning>
            <CalendarClock className="h-3.5 w-3.5" />
            {formatPredictionKickoff(prediction.startAt)}
          </div>
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add your take before sharing..."
        rows={2}
        className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-700 dark:bg-slate-900 dark:text-white"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => publish('poll')}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
        >
          <BarChart2 className="h-3.5 w-3.5" /> Poll this
        </button>
        <button
          type="button"
          onClick={() => publish('share')}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? <Send className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {isPending ? 'Posting…' : 'Share'}
        </button>
      </div>
    </article>
  );
}

export default function SportsPredictionsBoard({ initial }: { initial: SportsBoard }) {
  const [board, setBoard] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/sports?refresh=1', { cache: 'no-store' });
        if (!res.ok) return;
        const next = (await res.json()) as SportsBoard;
        if (!cancelled) setBoard(next);
      } catch {
        /* keep last good predictions */
      }
    };
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const predictions = board.predictions || [];

  return (
    <div className="mx-auto mt-4 max-w-5xl p-3 sm:mt-6 sm:p-4">
      <Link href="/sports" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
        <ArrowLeft className="h-4 w-4" /> Back to sports scores
      </Link>

      <div className="mb-5 overflow-hidden rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 p-5 text-white shadow-lg dark:border-violet-900/60">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-100">RapidAPI football</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight">
              <Trophy className="h-7 w-7 text-amber-300" /> Match predictions
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-violet-100">
              UEFA classic market predictions, odds, and quick actions to share or poll your followers.
            </p>
          </div>
          <span className="rounded-full bg-white/18 px-3 py-1.5 text-xs font-black uppercase tracking-wide backdrop-blur">
            {predictions.length} picks
          </span>
        </div>
      </div>

      {predictions.length === 0 ? (
        <EmptyState variant="search" title="No predictions available">
          Add RAPIDAPI_KEY in your environment, or try refreshing later when the prediction feed has matches.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {predictions.map((prediction) => (
            <PredictionCard key={prediction.id} prediction={prediction} />
          ))}
        </div>
      )}
    </div>
  );
}
