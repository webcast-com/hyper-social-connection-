import { parseEspnEvents } from './espn';
import type { EspnLeague } from './sports-catalog';
import { EspnEndpointError, espnResponseMetadata, espnErrorMessage, espnScoreboardUrl } from './espn-endpoints';
export { espnScoreboardUrl } from './espn-endpoints';

type TransportOptions = { timeoutMs?: number; retryDelayMs?: number };

/** Server-side ESPN transport. Two attempts share one deadline, not two timeouts. */
export async function fetchEspnScoreboard(league: EspnLeague, options: TransportOptions = {}) {
  const url = espnScoreboardUrl(league);
  const timeoutMs = options.timeoutMs ?? 4_000;
  const delayMs = options.retryDelayMs ?? 150;
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let httpStatus: number | null = null;
  const timeoutError = () => new EspnEndpointError(`ESPN request timed out after ${timeoutMs}ms`, url, 'timeout', httpStatus);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let retry = false;
      let retryAfterMs = delayMs;
      let parsing = false;
      httpStatus = null;
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'HyperSports/1.0 (+https://hyper.social)' },
          cache: 'no-store',
        });
        httpStatus = response.status;
        if (!response.ok) {
          retry = [429, 500, 502, 503, 504].includes(response.status);
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            const wait = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(wait)) retryAfterMs = Math.max(delayMs, wait);
          }
          // Release the failed response before retrying; never retry unsupported feeds.
          const metadata = espnResponseMetadata(response.headers);
          await response.body?.cancel().catch(() => undefined);
          throw new EspnEndpointError(`ESPN HTTP ${response.status}`, url, 'http', response.status, metadata);
        }
        parsing = true;
        const events = parseEspnEvents(await response.json(), league);
        return { events, url, httpStatus: response.status };
      } catch (error) {
        if (controller.signal.aborted) throw timeoutError();
        const connectionFailure = !parsing && error instanceof TypeError && error.message === 'fetch failed';
        if (attempt === 1 || (!retry && !connectionFailure) || Date.now() + retryAfterMs >= deadline) {
          if (error instanceof EspnEndpointError) throw error;
          throw new EspnEndpointError(espnErrorMessage(error), url, parsing ? 'invalid-response' : 'network', httpStatus);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      if (controller.signal.aborted) throw timeoutError();
    }
    throw new EspnEndpointError('ESPN request failed', url, 'network', httpStatus);
  } finally {
    clearTimeout(timer);
  }
}

/** Compatibility wrapper for callers that only need normalized events. */
export async function fetchEspnEvents(league: EspnLeague, options: TransportOptions = {}) {
  return (await fetchEspnScoreboard(league, options)).events;
}
