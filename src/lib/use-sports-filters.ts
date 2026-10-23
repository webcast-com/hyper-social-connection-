'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_SPORTS_FILTERS, normalizeSportsFilters, readSportsFilters, sportsFilterHref, sportsFilterSearch, type SportsFilters } from './sports-filters';

const CHANGE_EVENT = 'hyper:sports-filters';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(CHANGE_EVENT, listener); };
}
const getSnapshot = () => window.location.search;

/** Native history updates do not navigate/refetch the score feed. SSR gets the same validated state. */
export function useSportsFilters(initial: SportsFilters = DEFAULT_SPORTS_FILTERS) {
  const serverSearch = sportsFilterSearch(initial);
  const search = useSyncExternalStore(subscribe, getSnapshot, () => serverSearch);
  const filters = useMemo(() => readSportsFilters(new URLSearchParams(search)), [search]);
  const update = (patch: Partial<SportsFilters>, mode: 'push' | 'replace' = 'push') => {
    const next = normalizeSportsFilters({ ...readSportsFilters(new URLSearchParams(window.location.search)), ...patch });
    const href = sportsFilterHref(next);
    if (`${window.location.pathname}${window.location.search}` !== href) {
      if (mode === 'replace') window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  };
  return { filters, update };
}
