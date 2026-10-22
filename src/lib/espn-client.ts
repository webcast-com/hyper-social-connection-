import { parseEspnEvents } from './espn';
import type { EspnLeague } from './sports-catalog';

export function espnScoreboardUrl(league: EspnLeague): string {
  return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`;
}

function networkMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Request failed';
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return [error.message, cause?.code || cause?.message].filter(Boolean).join(': ');
}

/** Server-side ESPN transport. Two attempts share one deadline, not two timeouts. */
export async function fetchEspnEvents(
  league: EspnLeague,
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const delayMs = options.retryDelayMs ?? 150;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let retry = false;
      let retryAfterMs = delayMs;
      try {
        const response = await fetch(espnScoreboardUrl(league), {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'HyperSports/1.0 (+https://hyper.social)' },
          cache: 'no-store',
        });
        if (!response.ok) {
          retry = [429, 500, 502, 503, 504].includes(response.status);
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            const wait = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(wait)) retryAfterMs = Math.max(delayMs, wait);
          }
          // Release the failed response before retrying; never retry unsupported feeds.
          await response.body?.cancel();
          throw new Error(`ESPN HTTP ${response.status}`);
        }
        // JSON/schema errors are not transient connection failures.
        return parseEspnEvents(await response.json(), league);
      } catch (error) {
        if (controller.signal.aborted) throw new Error(`ESPN request timed out after ${timeoutMs}ms`);
        const connectionFailure = error instanceof TypeError && error.message === 'fetch failed';
        if (attempt === 1 || (!retry && !connectionFailure) || Date.now() + retryAfterMs >= deadline) {
          throw new Error(networkMessage(error));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      if (controller.signal.aborted) throw new Error(`ESPN request timed out after ${timeoutMs}ms`);
    }
    throw new Error('ESPN request failed');
  } finally {
    clearTimeout(timer);
  }
}
