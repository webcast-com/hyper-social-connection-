/**
 * One safety rule for every provider-reported image URL, whether it is a team
 * crest in a league table or a player photo in a match lineup.
 *
 * The host is deliberately not allowlisted: these values only ever come from an
 * ESPN response, and which of ESPN's CDN hosts serves a given competition cannot
 * be verified from every environment this app runs in — a wrong allowlist would
 * silently drop real photos. What is enforced is that the value is an absolute
 * https URL of bounded length with no embedded credentials, so a `javascript:`,
 * `data:` or protocol-relative value can never reach an `img src`.
 *
 * A rejected value is not an error: callers fall back to their text-only or
 * initials presentation, exactly as they do when the provider reports no image.
 */
export function safeProviderImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
