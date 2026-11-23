/**
 * Readable addresses: a name in front of the id, never instead of it.
 *
 * `/sports/matches/epl/arsenal-vs-chelsea-740123` reads better in a search result
 * and in a pasted link than `/sports/matches/epl/740123`, and the words in an
 * address are a (small) signal of what the page is about. But a name is not an
 * identity: two fixtures share one, a clip's title can be edited, and a title in
 * a script this module cannot transliterate has no words to offer at all. So the
 * id stays, at the end, and it alone decides which record is served. The words
 * are decoration the server is free to correct with a redirect.
 *
 * Pure, so the rule for building an address and the rule for reading one back can
 * be tested against each other without a route.
 */

/**
 * Long enough for two full club names and "vs" — "North Carolina Central Eagles vs
 * South Carolina State Bulldogs" is 62 — because a fixture's address that names
 * only one side, or half of the other, says the wrong thing. Short enough that a
 * headline-length clip title is still cut.
 */
export const SLUG_MAX = 80;

/**
 * A name as lower-case words joined by dashes, or '' when it has no such words.
 *
 * Accents are folded ("Atlético" is `atletico`, the way people type it), "&" is
 * spoken, apostrophes vanish rather than splitting a word, and everything else
 * that is not a letter or a digit becomes one dash. A long name is cut at a word
 * boundary, so the address never ends in half a word.
 */
export function slugWords(name: string | null | undefined, max: number = SLUG_MAX): string {
  if (typeof name !== 'string') return '';
  const words = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (words.length <= max) return words;
  const cut = words.slice(0, max + 1);
  const end = cut.lastIndexOf('-');
  return (end > 0 ? cut.slice(0, end) : words.slice(0, max)).replace(/-+$/g, '');
}

/**
 * `{words}-{id}` for a numeric id, and the bare id when there are no words.
 *
 * Only a numeric id takes a name. The id is read back as the digits after the
 * last dash, and an id that itself contains dashes or letters could not be told
 * apart from the words in front of it.
 */
export function namedSegment(name: string | null | undefined, id: string): string {
  if (!/^\d+$/.test(id)) return id;
  const words = slugWords(name);
  return words ? `${words}-${id}` : id;
}

/**
 * The numeric id a segment ends in, and whether words came before it.
 *
 * Null when the segment does not end in digits after a dash (or is not all
 * digits): that is not a named address, and the caller decides what else it
 * might be.
 */
export function trailingId(segment: string | null | undefined): { id: string; named: boolean } | null {
  if (typeof segment !== 'string') return null;
  const match = /^(?:(.*)-)?(\d+)$/.exec(segment);
  return match ? { id: match[2], named: match[1] !== undefined } : null;
}
