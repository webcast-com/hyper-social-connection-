/**
 * Addresses for the three things members make: a profile, a group and a post.
 *
 * Each is its id with a name in front — `/profile/maya-patel-4`,
 * `/groups/sunday-league-12`, `/post/dropped-a-new-original-track-91` — built by
 * the one rule matches and highlight clips already use (`seo-slug.ts`): the id at
 * the end is what the page is found by, and the words are there to be read.
 *
 * What is different here is that these words can be somebody's to keep private.
 * So a name goes into an address only where anybody may already read it:
 *
 * - a **profile** always, because a member's name is printed beside everything
 *   they post and is the title of their page whoever asks for it;
 * - a **group** only when it is public — a private group's name is its members';
 * - a **post** only when the post is one anybody may read (`isPublicPost`), and
 *   then only its opening words.
 *
 * Everything else keeps the bare id, which is the address all of them had before
 * and which every page still answers.
 *
 * Pure: no database, no request, so a link built in the browser and the address
 * a server checks it against come from the same lines.
 */
import { namedSegment, slugWords } from './seo-slug';

type Id = number | string;

/** A post's words in an address: a phrase, not the post. */
export const POST_SLUG_MAX = 60;

/** A member's page. */
export function profileHref(user: { id: Id; name?: string | null }): string {
  return `/profile/${namedSegment(user.name, String(user.id))}`;
}

/** A group's page: named when the group is public, the bare id otherwise. */
export function groupHref(group: { id: Id; name?: string | null; privacy?: string | null }): string {
  return `/groups/${namedSegment(group.privacy === 'public' ? group.name : null, String(group.id))}`;
}

/**
 * The words a post lends its address: its first line that has any, without links.
 *
 * A link's own address inside another address is noise, a line of emoji has
 * nothing to offer, and a bare repost says only that it is one.
 */
export function postSlugText(content: string | null | undefined): string {
  if (typeof content !== 'string' || content.trim() === '🔁 Reposted') return '';
  for (const line of content.replace(/https?:\/\/\S+/gi, ' ').split(/\r?\n/)) {
    const words = slugWords(line, POST_SLUG_MAX);
    if (words) return words;
  }
  return '';
}

/**
 * Whether a post, as a card in the browser holds it, may lend its words to a link.
 *
 * The same four conditions as `isPublicPost`, read more strictly: a post that
 * belongs to a group needs that group's privacy to be on the object and to say
 * "public", so a card that was handed a group post without its group cannot
 * mistake it for a post outside any group. A card that is unsure links by id,
 * and the page corrects the address if the post turns out to be public.
 */
export function mayNamePost(post: {
  privacy?: string | null;
  groupId?: Id | null;
  scheduledAt?: Date | string | null;
  user?: { profileVisibility?: string | null } | null;
  group?: { privacy?: string | null } | null;
} | null | undefined, now: Date = new Date()): boolean {
  if (!post) return false;
  if (post.privacy !== 'public' || post.user?.profileVisibility !== 'public') return false;
  if ((post.groupId || post.group) && post.group?.privacy !== 'public') return false;
  if (post.scheduledAt && new Date(post.scheduledAt) > now) return false;
  return true;
}

/**
 * A post's page. `isPublic` is the caller's answer to "may anybody read this
 * post?" — `isPublicPost`, nothing looser — and without a yes the address is the
 * bare id: a private post's words must never travel in a link.
 */
export function postHref(post: { id: Id; content?: string | null }, isPublic: boolean): string {
  const id = String(post.id);
  const words = isPublic && /^\d+$/.test(id) ? postSlugText(post.content) : '';
  return `/post/${words ? `${words}-${id}` : id}`;
}

/**
 * Where a request should be sent instead, or null when it is already at the
 * page's own address.
 *
 * `asked` is the address as requested (root and segment, no query). The query
 * string goes along with the redirect: `?tab=saved` and a share's `?u=` are part
 * of what the reader asked for, and only the spelling of the page is corrected.
 */
export function canonicalRedirect(
  canonical: string,
  asked: string,
  query?: Record<string, string | string[] | undefined> | null,
): string | null {
  if (canonical === asked) return null;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) if (typeof item === 'string') search.append(key, item);
  }
  const suffix = search.toString();
  return suffix ? `${canonical}?${suffix}` : canonical;
}
