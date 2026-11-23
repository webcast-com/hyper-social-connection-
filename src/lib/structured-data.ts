/**
 * schema.org structured data for the social pages and the listing pages: a post,
 * a member's profile, the organisation, the highlights list, and breadcrumbs.
 *
 * The rules every builder here keeps:
 *
 *   - it says only what the page shows a signed-out visitor. Nothing private, no
 *     count the page does not print, no date the page does not print;
 *   - a value that is missing is left out, never guessed or filled with a
 *     placeholder;
 *   - an address is absolute, `https` and carries no credentials, or it is left
 *     out. A `data:` avatar or a `javascript:` link never reaches the markup;
 *   - a builder that has nothing worth saying returns null, and the page then
 *     emits no script at all.
 *
 * Pure: no database, no environment. Whether a post or a profile is public is
 * decided by the caller, with the same rule that decides whether the page may be
 * indexed (`isPublicPost` below, `isAppAccount` for profiles).
 *
 * The match, clip, live-stream and dashboard pages have their own builders
 * (`match-page`, `highlight-clip`, `stream-seo`, `dashboard-seo`).
 */
import { clipHref } from './highlight-clip';
import { postHref, profileHref } from './social-href';

type Json = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

const base = (origin: string) => origin.replace(/\/+$/, '');

/** `value` as an absolute https address on or off this site, or null. */
export function publicUrl(value: string | null | undefined, origin: string): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const url = new URL(raw, `${base(origin)}/`);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const isoDate = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const text = (value: string | null | undefined): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

const count = (value: number | null | undefined): number | null =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

const counter = (action: string, value: number | null): Json | null => (value === null ? null : {
  '@type': 'InteractionCounter',
  interactionType: `${CONTEXT}/${action}`,
  userInteractionCount: value,
});

const present = <T>(entry: T | null): entry is T => entry !== null;

/** How `JSON.stringify` output is written into a `<script>`: `<` cannot close it. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* ── Breadcrumbs ─────────────────────────────────────────────────────────── */

export type Crumb = { name: string; path: string };

/**
 * A `BreadcrumbList` for a trail that starts at the homepage. The last crumb is
 * the page itself and, as schema.org asks, carries no `item`. A crumb with no
 * name is dropped; a trail of fewer than two is not a trail, so null.
 */
export function breadcrumbStructuredData(trail: readonly Crumb[], origin: string): Json | null {
  const crumbs = trail.map((crumb) => ({ name: text(crumb.name), path: crumb.path })).filter((crumb) => crumb.name);
  if (crumbs.length < 2) return null;
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(index < crumbs.length - 1 ? { item: new URL(crumb.path, `${base(origin)}/`).toString() } : {}),
    })),
  };
}

export const HOME_CRUMB: Crumb = { name: 'Home', path: '/' };
export const SPORTS_CRUMB: Crumb = { name: 'Sports', path: '/sports' };
export const GROUPS_CRUMB: Crumb = { name: 'Groups', path: '/groups' };

/* ── Organisation ────────────────────────────────────────────────────────── */

/**
 * Who publishes the site, for the homepage. Name, address and logo only: there
 * is no published company address, phone number or social account to state, and
 * none is invented.
 */
export function organizationStructuredData(origin: string): Json {
  const site = base(origin);
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: 'Hyper',
    url: `${site}/`,
    logo: `${site}/icon-512.png`,
  };
}

/* ── Posts ───────────────────────────────────────────────────────────────── */

/**
 * Whether a post is one anybody may read: public itself, by a public profile,
 * outside any private group, and already published. The one rule the post page
 * uses both for `index` and for its structured data, so the two cannot disagree.
 */
export function isPublicPost(post: {
  privacy?: string | null;
  scheduledAt?: Date | string | null;
  user?: { profileVisibility?: string | null } | null;
  group?: { privacy?: string | null } | null;
} | null | undefined, now: Date = new Date()): boolean {
  if (!post) return false;
  if (post.privacy !== 'public' || post.user?.profileVisibility !== 'public') return false;
  if (post.group && post.group.privacy !== 'public') return false;
  if (post.scheduledAt && new Date(post.scheduledAt) > now) return false;
  return true;
}

export type PostFacts = {
  id: number;
  content?: string | null;
  imageUrl?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  author: { id: number; name?: string | null; avatar?: string | null } | null | undefined;
  /** As printed under the post. Left out when the page could not count them. */
  likes?: number | null;
  comments?: number | null;
};

/**
 * A public post as a `SocialMediaPosting`.
 *
 * Null unless it has the three things a posting needs to be one: an author with
 * a name, the moment it was published, and something posted (words or a picture).
 * A repost with nothing added, or a poll with no text, is therefore not described
 * rather than described as an empty post. Comments are counted, never quoted: a
 * commenter's own visibility is not this post's to decide.
 */
export function socialPostStructuredData(post: PostFacts, origin: string): Json | null {
  const site = base(origin);
  const name = text(post.author?.name);
  const published = isoDate(post.createdAt);
  const body = text(post.content);
  const image = publicUrl(post.imageUrl, origin);
  if (!post.author || !name || !published || (!body && !image)) return null;
  const modified = isoDate(post.updatedAt);
  const avatar = publicUrl(post.author.avatar, origin);
  const interactions = [counter('LikeAction', count(post.likes)), counter('CommentAction', count(post.comments))].filter(present);
  // Only ever built for a post anybody may read (see the comment above), so its
  // address is the one that post answers at: its opening words, then its id.
  const url = `${site}${postHref(post, true)}`;
  return {
    '@context': CONTEXT,
    '@type': 'SocialMediaPosting',
    url,
    mainEntityOfPage: url,
    ...(body ? { headline: body.length > 110 ? `${body.slice(0, 109)}…` : body, text: body } : {}),
    ...(image ? { image } : {}),
    datePublished: published,
    ...(modified && modified > published ? { dateModified: modified } : {}),
    author: {
      '@type': 'Person',
      name,
      url: `${site}${profileHref(post.author)}`,
      ...(avatar ? { image: avatar } : {}),
    },
    ...(interactions.length ? { interactionStatistic: interactions } : {}),
  };
}

/* ── Profiles ────────────────────────────────────────────────────────────── */

export type ProfileFacts = {
  id: number;
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatar?: string | null;
  createdAt?: Date | string | null;
  followers?: number | null;
  following?: number | null;
};

/**
 * A member's public profile as a `ProfilePage` about a `Person`: the name, the
 * handle, the bio, the picture, when they joined and the two follow counts, all
 * of which the page prints. Location, work, education and the member's own
 * website are on the page too, but they are theirs to have shown there, not
 * facts this site vouches for to a search engine, so they are not repeated.
 */
export function profilePageStructuredData(profile: ProfileFacts, origin: string): Json | null {
  const name = text(profile.name);
  if (!name) return null;
  const url = `${base(origin)}${profileHref(profile)}`;
  const handle = text(profile.username);
  const bio = text(profile.bio);
  const image = publicUrl(profile.avatar, origin);
  const joined = isoDate(profile.createdAt);
  const followers = counter('FollowAction', count(profile.followers));
  const following = counter('FollowAction', count(profile.following));
  return {
    '@context': CONTEXT,
    '@type': 'ProfilePage',
    url,
    ...(joined ? { dateCreated: joined } : {}),
    mainEntity: {
      '@type': 'Person',
      '@id': `${url}#person`,
      name,
      ...(handle ? { alternateName: handle } : {}),
      ...(bio ? { description: bio } : {}),
      ...(image ? { image } : {}),
      url,
      ...(followers ? { interactionStatistic: followers } : {}),
      ...(following ? { agentInteractionStatistic: following } : {}),
    },
  };
}

/* ── Highlights list ─────────────────────────────────────────────────────── */

/** How many clip pages the list names. The page shows more; this stays bounded. */
export const CLIP_LIST_LIMIT = 50;

/**
 * The highlights page as a list of the clip pages it links to. Each entry is a
 * position and an address only: the clip's own page carries its `VideoObject`,
 * and repeating a summary of it here would be a second, thinner description of
 * the same video. Only stored clips are passed in, because only those have pages.
 */
export function clipListStructuredData(clips: readonly { id: string }[], origin: string, limit = CLIP_LIST_LIMIT): Json | null {
  const site = base(origin);
  const urls = [...new Set(clips.filter((clip) => clip && clip.id).map((clip) => `${site}${clipHref(clip)}`))].slice(0, Math.max(0, limit));
  if (urls.length === 0) return null;
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name: 'Match highlights',
    url: `${site}/sports/highlights`,
    numberOfItems: urls.length,
    itemListElement: urls.map((url, index) => ({ '@type': 'ListItem', position: index + 1, url })),
  };
}
