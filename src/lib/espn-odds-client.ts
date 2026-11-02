import { isOddsBoard, normalizeOddsRequest, type OddsBoard } from './espn-odds';
import { isInsightsBoard, type InsightsBoard } from './espn-insights';
import { resolveMatch, type MatchReference } from './espn-match';

export class SportsRequestError extends Error {
  constructor(message: string, readonly httpStatus: number | null = null) {
    super(message); this.name = 'SportsRequestError';
  }
}

type Pending = { controller: AbortController; promise: Promise<unknown>; users: number; settled: boolean };
const pending = new Map<string, Pending>();
const MAX_BYTES = 2 * 1024 * 1024;

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new SportsRequestError('Empty sports response');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new SportsRequestError('Sports response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

/** Coalesce only active reads. One unmounted subscriber cannot abort another. */
function sharedJson<T>(key: string, url: string, init: RequestInit, validate: (value: unknown) => value is T, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  let job = pending.get(key);
  if (!job) {
    const controller = new AbortController();
    const created: Pending = { controller, users: 0, settled: false, promise: Promise.resolve() };
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new SportsRequestError('Sports request timed out')); controller.abort(); }, timeoutMs);
      controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const fetchJson = async () => {
      const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'omit', signal: controller.signal });
      // HTTP status wins even if a proxy returns a success-shaped JSON body.
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new SportsRequestError('Sports request failed', response.status);
      }
      const value = await readJson(response);
      if (!validate(value)) throw new SportsRequestError('Invalid sports response');
      return value;
    };
    created.promise = Promise.race([fetchJson(), deadline]).finally(() => {
      clearTimeout(timer); created.settled = true;
      if (pending.get(key) === created) pending.delete(key);
    });
    pending.set(key, created); job = created;
  }
  const active = job; active.users++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (action: () => void) => {
      if (finished) return;
      finished = true; signal?.removeEventListener('abort', abort); active.users--;
      if (!active.users && !active.settled) {
        if (pending.get(key) === active) pending.delete(key);
        active.controller.abort();
      }
      action();
    };
    const abort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    signal?.addEventListener('abort', abort, { once: true });
    active.promise.then((value) => finish(() => resolve(value as T)), (error: unknown) => finish(() => reject(error)));
    if (signal?.aborted) abort();
  });
}

export function refreshEspnOdds(options: unknown, signal?: AbortSignal): Promise<OddsBoard> {
  const body = JSON.stringify(normalizeOddsRequest(options));
  // Server budget is 25 seconds; allow room for serialization/network transit.
  return sharedJson(`odds:${body}`, '/api/sports/predictions?refresh=1', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body,
  }, isOddsBoard, 35_000, signal);
}

export function fetchEspnInsights(reference: MatchReference, refresh = false, signal?: AbortSignal): Promise<InsightsBoard> {
  resolveMatch(reference.league, reference.eventId); // Catalog + ID validation; no arbitrary paths/hosts.
  const url = `/api/sports/matches/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.eventId)}/insights${refresh ? '?refresh=1' : ''}`;
  return sharedJson(url, url, { headers: { Accept: 'application/json' } },
    (value): value is InsightsBoard => isInsightsBoard(value, reference), 20_000, signal);
}
