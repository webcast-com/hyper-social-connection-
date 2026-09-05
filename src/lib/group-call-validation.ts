/** PostgreSQL call/group/user IDs are positive 32-bit integers, not booleans. */
export function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : null;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** JSON primitives (especially null) must yield 400s, not property-access crashes. */
export async function readCallBody(request: Request, allowEmpty = false): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (allowEmpty && !text.trim()) return {};
    const body: unknown = JSON.parse(text);
    return isJsonObject(body) ? body : null;
  } catch {
    return null;
  }
}
