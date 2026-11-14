/**
 * Which id a dynamic route segment names, and when it names none.
 *
 * Three routes take a numeric id from a URL — a profile, a group and a post — and
 * all three used to parse it their own way, each of them loose in a different
 * direction. `parseInt(id) || 1` turned `/profile/abc` into member 1;
 * `Number(raw)` turned `/post/1e3` into post 1000 and `/post/0x10` into post 16;
 * `parseInt(id)` handed `/groups/abc` a NaN that Prisma then rejected, and the
 * rejection was logged as a database failure. A URL that names nobody rendered
 * somebody, at HTTP 200.
 *
 * So there is one rule, and every route that takes an id asks it: **an id is a
 * positive integer written in full, or it is not an id.** Padded, truncated, signed,
 * fractional, exponential, hexadecimal, zero, negative and past-a-safe-integer
 * segments are all refused rather than guessed at, because a guess renders a real
 * person, group or post under an address that is not theirs — and because the
 * metadata and the page must not disagree about which one is being shown.
 *
 * Null here is not "no such record"; that is the database's answer, and it is a
 * different question. Null is "this is not an id at all", which needs no database to
 * know, and which is why a route can answer it before it queries anything.
 */
export function routeIdFromParam(raw: string | number | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
