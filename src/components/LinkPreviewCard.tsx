'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Globe, X } from 'lucide-react';
import type { LinkPreviewData } from '@/lib/link-preview';

export default function LinkPreviewCard({
  url,
  previewData,
  onRemove,
}: {
  url: string;
  previewData?: LinkPreviewData | null;
  onRemove?: () => void;
}) {
  const [data, setData] = useState<LinkPreviewData | null>(previewData || null);
  const [loading, setLoading] = useState(!previewData);

  // Sync state when the previewData prop changes (React's sanctioned
  // "adjusting state during render" pattern — no effect needed).
  const [prevPreviewData, setPrevPreviewData] = useState(previewData);
  const [prevUrl, setPrevUrl] = useState(url);
  if (previewData !== prevPreviewData) {
    setPrevPreviewData(previewData);
    setData(previewData || null);
    setLoading(!previewData);
  } else if (url !== prevUrl) {
    // New URL to fetch a preview for — restart in loading state.
    setPrevUrl(url);
    setData(null);
    setLoading(true);
  }

  useEffect(() => {
    if (previewData) {
      return;
    }

    let cancelled = false;

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        if (!cancelled && resData) {
          setData(resData);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, previewData]);

  if (loading) {
    return (
      <div className="my-3 w-full min-w-0 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-4 animate-pulse">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="w-3/4 h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="relative my-3 group select-none w-full min-w-0 max-w-full">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 p-1 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
          aria-label="Remove link preview"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/40 hover:bg-gray-100/80 dark:hover:bg-gray-900/80 overflow-hidden transition-all shadow-sm group-hover:border-blue-300 dark:group-hover:border-blue-700 min-w-0"
      >
        {/* Cover Preview Image (if available) */}
        {data.image && (
          <div className="relative w-full h-36 sm:h-44 bg-gray-200 dark:bg-gray-800 overflow-hidden">
            <img
              src={data.image}
              alt={data.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Card Body */}
        <div className="p-3 sm:p-3.5 space-y-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium min-w-0">
            {data.favicon ? (
              <img src={data.favicon} alt="" className="w-3.5 h-3.5 rounded shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            )}
            <span className="truncate min-w-0 flex-1">{data.domain}</span>
            <ExternalLink className="w-3 h-3 shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>

          <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
            {data.title}
          </h4>

          {data.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
              {data.description}
            </p>
          )}
        </div>
      </a>
    </div>
  );
}
