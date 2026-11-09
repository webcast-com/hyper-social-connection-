/** Narrow same-origin fallback for the standalone dashboard's documented ESPN requests. */
const leagues = new Set([
  'basketball/nba', 'basketball/wnba', 'basketball/nbl', 'basketball/euroleague',
  'basketball/mens-college-basketball', 'basketball/womens-college-basketball',
  'football/nfl', 'football/college-football',
]);
const queryPatterns: Record<string, RegExp> = {
  limit: /^\d{1,3}$/, dates: /^\d{8}(?:-\d{8})?$/, week: /^\d{1,2}$/,
  seasontype: /^[1-3]$/, season: /^\d{4}$/, event: /^\d{1,20}$/,
};
const maxBytes = 4 * 1024 * 1024;
let activeRequests = 0;
const maxActiveRequests = 10;

export function dashboardEspnUrl(kind: 'site' | 'web', segments: string[], query: URLSearchParams): string | null {
  if (segments.some((segment) => !/^[a-zA-Z0-9-]{1,40}$/.test(segment))) return null;
  const path = segments.join('/');
  const match = kind === 'site'
    ? path.match(/^apis\/(site\/v2|v2)\/sports\/(basketball|football)\/([^/]+)\/(.+)$/)
    : path.match(/^apis\/(common\/v3)\/sports\/(basketball|football)\/([^/]+)\/(.+)$/);
  if (!match || !leagues.has(`${match[2]}/${match[3]}`)) return null;
  const [, prefix, , , endpoint] = match;
  const allowed = prefix === 'site/v2'
    ? /^(scoreboard|news|summary|teams\/[A-Za-z0-9-]{1,40}(?:\/(?:schedule|roster))?)$/.test(endpoint)
    : prefix === 'v2' ? endpoint === 'standings'
      : /^(leaders|athletes\/[A-Za-z0-9-]{1,40})$/.test(endpoint);
  if (!allowed) return null;
  const keys = new Set<string>();
  for (const [key, value] of query) {
    if (keys.has(key) || !Object.hasOwn(queryPatterns, key) || !queryPatterns[key].test(value)) return null;
    if (key === 'limit' && (Number(value) < 1 || Number(value) > 100)) return null;
    keys.add(key);
  }
  const url = new URL(`https://${kind === 'site' ? 'site.api.espn.com' : 'site.web.api.espn.com'}/${path}`);
  url.search = query.toString();
  return url.toString();
}

export async function dashboardEspnProxy(request: Request, kind: 'site' | 'web', segments: string[]): Promise<Response> {
  const url = dashboardEspnUrl(kind, segments, new URL(request.url).searchParams);
  if (!url) return new Response('Unsupported ESPN request', { status: 400 });
  if (activeRequests >= maxActiveRequests) return new Response('ESPN fallback is busy', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  activeRequests++;
  const signal = AbortSignal.timeout(8000);
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal, redirect: 'error' });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      return new Response('ESPN request failed', { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
    }
    const reader = upstream.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    // Do not forward HTML or invalid upstream content as a successful JSON response.
    const text = new TextDecoder().decode(bytes);
    JSON.parse(text);
    return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('ESPN is unavailable', { status: signal.aborted ? 504 : 502, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    activeRequests--;
  }
}
