'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

/** Reads the saved/system theme. Client-only — never called during SSR. */
function getThemeSnapshot(): boolean {
  const saved = localStorage.getItem('theme');
  return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function subscribeTheme() {
  // No external events to subscribe to — every write goes through this
  // component, so the store only needs a one-shot snapshot.
  return () => {};
}

/**
 * Dark mode toggle. SSR-safe: the server renders with the fallback snapshot
 * (false) so the server HTML matches the first client render during
 * hydration; afterwards the real saved/system preference is adopted and the
 * `dark` class is applied to <html> (class-based dark variant, globals.css).
 */
export default function DarkModeToggle() {
  const savedDark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => false);
  // User override (from toggling) takes precedence over the saved/system value.
  const [override, setOverride] = useState<boolean | null>(null);
  const dark = override ?? savedDark;

  // Apply the theme to the document (external system — no setState in here).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    setOverride(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors hover:scale-105 dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      {dark ? (
        <Sun className="w-5 h-5 text-amber-400" />
      ) : (
        <Moon className="w-5 h-5 text-gray-700" />
      )}
    </button>
  );
}
