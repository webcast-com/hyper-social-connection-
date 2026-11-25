"use client";

export function TipCardSkeleton() {
  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-4 h-16 animate-pulse rounded-xl bg-slate-50 dark:bg-slate-800/50" />
      <div className="mt-4 space-y-1">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-4 h-px bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}