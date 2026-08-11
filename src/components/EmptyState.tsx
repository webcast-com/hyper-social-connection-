import type { ReactNode } from 'react';

/**
 * Friendly empty-state block with a small hand-drawn SVG illustration.
 * Theme-aware: line art uses currentColor tones + brand accents.
 */

type Variant = 'feed' | 'people' | 'bookmark' | 'bell' | 'chat' | 'search';

function Illustration({ variant }: { variant: Variant }) {
  const common = {
    width: 120,
    height: 96,
    viewBox: '0 0 120 96',
    fill: 'none',
    className: 'mx-auto',
    'aria-hidden': true,
  } as const;

  switch (variant) {
    case 'feed':
      // Post card with text lines + pencil
      return (
        <svg {...common}>
          <rect x="22" y="14" width="64" height="52" rx="8" className="fill-white dark:fill-gray-800 stroke-gray-300 dark:stroke-gray-600" strokeWidth="2" />
          <circle cx="36" cy="28" r="5" className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-400" strokeWidth="2" />
          <line x1="46" y1="26" x2="72" y2="26" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="3" strokeLinecap="round" />
          <line x1="30" y1="42" x2="78" y2="42" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" strokeLinecap="round" />
          <line x1="30" y1="50" x2="66" y2="50" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" strokeLinecap="round" />
          <path d="M78 74 L96 56 L104 64 L86 82 L76 84 Z" className="fill-blue-500" opacity="0.9" />
          <path d="M96 56 L104 64" className="stroke-blue-700" strokeWidth="2" strokeLinecap="round" />
          <circle cx="98" cy="20" r="3" className="fill-blue-400" opacity="0.6" />
          <circle cx="14" cy="46" r="2.5" className="fill-indigo-400" opacity="0.5" />
        </svg>
      );
    case 'people':
      // Two friendly avatars
      return (
        <svg {...common}>
          <circle cx="46" cy="34" r="13" className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-400" strokeWidth="2" />
          <path d="M24 72 C24 58 34 52 46 52 C58 52 68 58 68 72" className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-400" strokeWidth="2" strokeLinecap="round" />
          <circle cx="76" cy="38" r="10" className="fill-indigo-100 dark:fill-indigo-900/40 stroke-indigo-400" strokeWidth="2" />
          <path d="M60 74 C60 62 68 57 76 57 C86 57 94 63 94 74" className="fill-indigo-100 dark:fill-indigo-900/40 stroke-indigo-400" strokeWidth="2" strokeLinecap="round" />
          <circle cx="102" cy="24" r="3" className="fill-blue-400" opacity="0.6" />
          <circle cx="18" cy="30" r="2.5" className="fill-indigo-400" opacity="0.5" />
        </svg>
      );
    case 'bookmark':
      // Bookmark over text lines
      return (
        <svg {...common}>
          <line x1="26" y1="26" x2="70" y2="26" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="3" strokeLinecap="round" />
          <line x1="26" y1="38" x2="60" y2="38" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" strokeLinecap="round" />
          <line x1="26" y1="50" x2="66" y2="50" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" strokeLinecap="round" />
          <path d="M78 22 H98 V74 L88 64 L78 74 Z" className="fill-blue-500" opacity="0.9" />
          <circle cx="20" cy="66" r="2.5" className="fill-blue-400" opacity="0.6" />
          <circle cx="104" cy="14" r="3" className="fill-indigo-400" opacity="0.5" />
        </svg>
      );
    case 'bell':
      // Bell with sparkles
      return (
        <svg {...common}>
          <path d="M60 18 C48 18 42 27 42 38 C42 52 36 58 34 62 H86 C84 58 78 52 78 38 C78 27 72 18 60 18 Z" className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-400" strokeWidth="2" strokeLinejoin="round" />
          <path d="M53 68 C54 72 56.5 74 60 74 C63.5 74 66 72 67 68" className="stroke-blue-400" strokeWidth="2" strokeLinecap="round" />
          <path d="M88 22 L90 28 L96 30 L90 32 L88 38 L86 32 L80 30 L86 28 Z" className="fill-indigo-400" opacity="0.8" />
          <circle cx="30" cy="24" r="2.5" className="fill-blue-400" opacity="0.6" />
        </svg>
      );
    case 'chat':
      // Two overlapping speech bubbles
      return (
        <svg {...common}>
          <path d="M24 20 H70 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 H44 L32 64 V54 H24 a8 8 0 0 1 -8 -8 V28 a8 8 0 0 1 8 -8 Z" className="fill-blue-100 dark:fill-blue-900/40 stroke-blue-400" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="34" cy="37" r="2.5" className="fill-blue-500" />
          <circle cx="46" cy="37" r="2.5" className="fill-blue-500" />
          <circle cx="58" cy="37" r="2.5" className="fill-blue-500" />
          <path d="M66 46 H96 a8 8 0 0 1 8 8 v12 a8 8 0 0 1 -8 8 H92 v8 L80 74 H66 a8 8 0 0 1 -8 -8 V54 a8 8 0 0 1 8 -8 Z" className="fill-indigo-100 dark:fill-indigo-900/40 stroke-indigo-400" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'search':
      // Magnifier with dashed orbit
      return (
        <svg {...common}>
          <circle cx="54" cy="42" r="20" className="fill-white dark:fill-gray-800 stroke-blue-400" strokeWidth="3" />
          <line x1="69" y1="57" x2="86" y2="74" className="stroke-blue-500" strokeWidth="6" strokeLinecap="round" />
          <path d="M20 42 A34 34 0 0 1 54 8" className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
          <circle cx="96" cy="26" r="3" className="fill-indigo-400" opacity="0.6" />
          <circle cx="22" cy="66" r="2.5" className="fill-blue-400" opacity="0.5" />
        </svg>
      );
  }
}

export default function EmptyState({
  variant,
  title,
  children,
  action,
}: {
  variant: Variant;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-8 sm:p-10 text-center">
      <Illustration variant={variant} />
      <h3 className="font-bold text-lg text-gray-900 dark:text-white mt-4">{title}</h3>
      {children && (
        <div className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
          {children}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
