/**
 * Where the stored highlights index lives.
 *
 * Two homes are supported:
 *
 *   github    JSON files in a folder of a Git branch, read over HTTP. A
 *             scheduled GitHub Action writes them
 *             (.github/workflows/highlights-sweep.yml). Needs no database.
 *   database  The `sports_highlight_*` tables in Postgres, written by the
 *             site itself as pages are loaded.
 *
 * The folder is used whenever its address is known. `next.config.ts` sets
 * `HIGHLIGHTS_DATA_URL` to this repository's `highlights-data` branch at build
 * time, so a deployed site needs no setting at all. A script or a test that
 * does not go through Next has no address and keeps the database behaviour.
 * `HIGHLIGHTS_STORE=database` switches the folder off.
 *
 * No imports, so the Next config, the scripts and the tests can all read it.
 */

export const HIGHLIGHTS_DATA_BRANCH = 'highlights-data';
export const HIGHLIGHTS_DATA_FOLDER = 'data/highlights';

/** The raw-file address of the folder on a GitHub repository's data branch. */
export function githubHighlightsUrl(repository: string): string {
  return `https://raw.githubusercontent.com/${repository}/${HIGHLIGHTS_DATA_BRANCH}/${HIGHLIGHTS_DATA_FOLDER}`;
}

/** The folder's address, without a trailing slash, or null when none is set. */
export function highlightsDataUrl(): string | null {
  // Written out in full: Next replaces this exact expression at build time.
  const configured = process.env.HIGHLIGHTS_DATA_URL;
  const url = typeof configured === 'string' ? configured.trim().replace(/\/+$/, '') : '';
  return /^https?:\/\//i.test(url) ? url : null;
}

export type HighlightsBackend = 'github' | 'database';

export function highlightsBackend(): HighlightsBackend {
  const forced = process.env.HIGHLIGHTS_STORE?.trim().toLowerCase();
  if (forced === 'database') return 'database';
  return highlightsDataUrl() ? 'github' : 'database';
}
