/**
 * What a reader saved on the live-stream screen: bookmarked matches, bookmarked
 * news items and favourite clubs.
 *
 * Kept in this browser's own storage and nowhere else: it needs no account, and
 * a guest's bookmarks survive a reload. A match is saved as a copy, because
 * SportSRC lists only the day's fixtures and a bookmark has to outlive the list
 * it came from.
 *
 * Reading goes through `useSyncExternalStore`, so every part of the screen sees
 * the same list and a change in another tab arrives here too.
 */
import { useSyncExternalStore } from 'react';
import type { StreamMatch } from './sportsrc';

export type SavedNews = { id: string; title: string; href: string; thumbnail: string | null; date: string | null };

export type StreamSaved = { matches: StreamMatch[]; news: SavedNews[]; clubs: string[] };

export const STREAM_SAVED_KEY = 'hyper:streams:saved:v1';
const LIMIT = 60;
const EMPTY: StreamSaved = Object.freeze({ matches: [], news: [], clubs: [] }) as StreamSaved;

const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastValue: StreamSaved = EMPTY;

function parse(raw: string | null): StreamSaved {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<StreamSaved> | null;
    if (!value || typeof value !== 'object') return EMPTY;
    return {
      matches: Array.isArray(value.matches) ? value.matches.filter((m) => m && typeof m.id === 'string' && m.home && m.away && m.score).slice(0, LIMIT) : [],
      news: Array.isArray(value.news) ? value.news.filter((n) => n && typeof n.id === 'string' && typeof n.href === 'string').slice(0, LIMIT) : [],
      clubs: Array.isArray(value.clubs) ? value.clubs.filter((c): c is string => typeof c === 'string' && c.trim() !== '').slice(0, LIMIT) : [],
    };
  } catch {
    return EMPTY;
  }
}

function read(): StreamSaved {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STREAM_SAVED_KEY);
  } catch {
    // Storage can be refused (private mode); the screen then keeps nothing.
    return lastValue;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parse(raw);
  }
  return lastValue;
}

function write(next: StreamSaved): void {
  lastValue = next;
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(STREAM_SAVED_KEY, raw);
    lastRaw = raw;
  } catch {
    // Still held in memory for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STREAM_SAVED_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The saved lists. Empty on the server and until the page has hydrated. */
export function useStreamSaved(): StreamSaved {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleSavedMatch(match: StreamMatch): void {
  const saved = read();
  const held = saved.matches.some((item) => item.id === match.id);
  write({ ...saved, matches: held ? saved.matches.filter((item) => item.id !== match.id) : [match, ...saved.matches].slice(0, LIMIT) });
}

export function toggleSavedNews(item: SavedNews): void {
  const saved = read();
  const held = saved.news.some((entry) => entry.id === item.id);
  write({ ...saved, news: held ? saved.news.filter((entry) => entry.id !== item.id) : [item, ...saved.news].slice(0, LIMIT) });
}

export function toggleFavouriteClub(name: string): void {
  const club = name.trim();
  if (!club) return;
  const saved = read();
  const held = saved.clubs.some((entry) => entry.toLowerCase() === club.toLowerCase());
  write({ ...saved, clubs: held ? saved.clubs.filter((entry) => entry.toLowerCase() !== club.toLowerCase()) : [...saved.clubs, club].slice(0, LIMIT) });
}
