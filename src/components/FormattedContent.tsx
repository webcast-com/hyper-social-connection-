'use client';

import React from 'react';
import Link from 'next/link';

export default function FormattedContent({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;

  // Regex to match hashtags (#word) and mentions (@word)
  const regex = /(#[\w\u0590-\u05ff]+|@[\w\u0590-\u05ff]+)/g;
  const parts = content.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('#')) {
          const tag = part.slice(1);
          return (
            <Link
              key={index}
              href={`/search?q=${encodeURIComponent(part)}`}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }

        if (part.startsWith('@')) {
          return (
            <Link
              key={index}
              href={`/search?q=${encodeURIComponent(part)}`}
              className="text-purple-600 dark:text-purple-400 font-semibold hover:underline cursor-pointer transition-colors"
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
