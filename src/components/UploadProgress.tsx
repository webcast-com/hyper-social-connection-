'use client';

import { formatBytes, type UploadProgressInfo } from '@/lib/upload';

export default function UploadProgress({
  info,
  label = 'Uploading…',
}: {
  info: UploadProgressInfo;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, info.percent));

  return (
    <div className="mt-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-300">
        <span className="font-semibold truncate">{label}</span>
        <span className="tabular-nums shrink-0 font-medium">
          {pct}%
          {info.total > 0 && (
            <span className="text-gray-400 dark:text-gray-500 font-normal">
              {' '}
              · {formatBytes(info.loaded)} / {formatBytes(info.total)}
            </span>
          )}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
