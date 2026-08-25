/**
 * Accept only same-origin uploaded files or absolute http(s) URLs.
 * Blocks javascript:, data:, and path-escape attempts.
 */
export function isSafeMediaUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/uploads/')) {
    return !trimmed.includes('..') && !trimmed.includes('\\');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
