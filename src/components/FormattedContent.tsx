'use client';

import React from 'react';
import Link from 'next/link';

/**
 * Renders post text with highlighted #hashtags and @mentions.
 *
 * `interactive` (default true): hashtags/mentions are links to /search.
 * Set it to false when the content is already rendered inside another
 * link (e.g. the search results card) — nested <a> tags are invalid HTML
 * and cause React hydration errors.
 */
export default function FormattedContent({
  content,
  className = '',
  interactive = true,
}: {
  content: string;
  className?: string;
  interactive?: boolean;
}) {
  if (!content) return null;

  // Regex to match hashtags (#word) and mentions (@word)
  const regex = /(#[\w\u0590-\u05ff]+|@[\w\u0590-\u05ff]+)/g;
  const parts = content.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('#')) {
          const cls = 'text-blue-600 dark:text-blue-400 font-semibold';
          if (!interactive) {
            return (
              <span key={index} className={cls}>
                {part}
              </span>
            );
          }
          return (
            <Link
              key={index}
              href={`/search?q=${encodeURIComponent(part)}`}
              className={`${cls} hover:underline cursor-pointer transition-colors`}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }

        if (part.startsWith('@')) {
          const cls = 'text-purple-600 dark:text-purple-400 font-semibold';
          if (!interactive) {
            return (
              <span key={index} className={cls}>
                {part}
              </span>
            );
          }
          return (
            <Link
              key={index}
              href={`/search?q=${encodeURIComponent(part)}`}
              className={`${cls} hover:underline cursor-pointer transition-colors`}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }

        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
}
