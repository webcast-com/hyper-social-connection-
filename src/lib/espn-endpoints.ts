import type { EspnLeague } from './sports-catalog';

export type EspnResponseMetadata = { server?: string; via?: string; contentType?: string; proxyBlockReason?: string };

// Deliberate allowlist: never expose cookies, auth, arbitrary headers or response bodies.
export function espnResponseMetadata(headers: Headers): EspnResponseMetadata {
  const selected: EspnResponseMetadata = {};
  for (const [key, header] of [['server', 'server'], ['via', 'via'], ['contentType', 'content-type'], ['proxyBlockReason', 'x-mitmproxy-blocked-reason']] as const) {
    const value = headers.get(header)?.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 160);
    if (value) selected[key] = value;
  }
  return selected;
}

export type EspnFailureKind = 'http' | 'network' | 'timeout' | 'invalid-response';
export type EspnEndpointDetails = {
  url: string;
  // null means no HTTP response was received, not a 404 or an empty schedule.
  httpStatus: number | null;
  errorKind?: EspnFailureKind;
  responseMetadata?: EspnResponseMetadata;
};

/** Site v2 scoreboards, shared by scores, odds and diagnostics. Not Core v2/v3. */
export function espnScoreboardUrl(league: Pick<EspnLeague, 'sport' | 'league'> | { path: string }, date?: string): string {
  const path = 'path' in league ? league.path : `${league.sport}/${league.league}`;
  if (!/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/.test(path)) throw new Error('Invalid ESPN scoreboard path');
  if (date !== undefined && !/^\d{8}$/.test(date)) throw new Error('ESPN date must use YYYYMMDD');
  return `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard${date ? `?dates=${date}&limit=100` : ''}`;
}

export class EspnEndpointError extends Error {
  constructor(message: string, readonly url: string, readonly errorKind: EspnFailureKind, readonly httpStatus: number | null = null, readonly responseMetadata?: EspnResponseMetadata) {
    super(message);
    this.name = 'EspnEndpointError';
  }
}

export function espnErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Request failed';
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return [error.message, cause?.code || cause?.message].filter(Boolean).join(': ');
}

export function espnFailureDetails(error: unknown, url: string): EspnEndpointDetails & { error: string } {
  if (error instanceof EspnEndpointError) {
    return { url: error.url, httpStatus: error.httpStatus, errorKind: error.errorKind, error: error.message,
      ...(error.responseMetadata && Object.keys(error.responseMetadata).length ? { responseMetadata: error.responseMetadata } : {}) };
  }
  const timeout = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
  return { url, httpStatus: null, errorKind: timeout ? 'timeout' : 'network', error: espnErrorMessage(error) };
}
