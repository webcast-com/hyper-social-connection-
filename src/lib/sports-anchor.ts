/**
 * Sports anchor posts — the shared, client-safe half.
 *
 * A sports card on the homepage is provider data, not a member's post, so the
 * social graph has nothing to attach to: `SportsPostCard` used to keep its
 * Like / Comment / Save state in `useState`, which vanished on reload and never
 * reached a count, a notification or a permalink.
 *
 * An *anchor post* closes that gap. The first time a signed-in member likes,
 * comments on, saves or shares a card, exactly one post is created for that feed
 * item and every later interaction reuses it — so likes, comments, bookmarks,
 * reposts, notifications and `/post/[id]` permalinks all work as they already do
 * for a member's post, with no parallel engagement system and no rows for cards
 * nobody engaged with.
 *
 * This module holds only the pure parts: the identity of a card and the text it
 * would post. Both the client components and the server store build keys from
 * here, so they can never disagree. Database work lives in
 * `sports-anchor-store.ts`.
 *
 * A client sends `{ kind, id }` and never content. The body, image and video of
 * an anchor post are always re-derived server-side from this site's own feeds,
 * so a card cannot be used to publish arbitrary text as the sports desk.
 */
import type { SportsLeaderRow, SportsLeaderSport } from './espn-leaders';
import type { SportsHighlightClip } from './espn-highlights';

/**
 * The desk that authors anchor posts. It is a real, followable author — members
 * can follow it and see sports anchors in their Following tab — but it holds a
 * hash of a discarded random secret, so it can never sign in, and it is kept out
 * of people suggestions, contacts and Discover.
 */
export const SPORTS_DESK = {
  name: 'Hyper Sports',
  email: 'sports@hyper.co.ke',
  username: 'hypersports',
  bio: 'The Hyper sports desk. Live scores, highlights, leaders and predictions from ESPN, posted here so members can like, comment and share them.',
};

/** Card types that can anchor a post. Extend as new sports zones land. */
export const SPORTS_ANCHOR_KINDS = ['leader', 'highlight'] as const;
export type SportsAnchorKind = (typeof SPORTS_ANCHOR_KINDS)[number];

/** The only thing a client supplies: which kind of card, and which one. */
export type SportsAnchorRef = { kind: SportsAnchorKind; id: string };

/** Everything needed to create the post, derived from the site's own feeds. */
export type SportsAnchorDraft = {
  ref: SportsAnchorRef;
  /** `posts.external_key` — one anchor post per key, enforced by the database. */
  externalKey: string;
  /** `posts.kind` — separates anchor posts from what members wrote themselves. */
  postKind: string;
  content: string;
  imageUrl: string | null;
  videoUrl: string | null;
};

export type SportsAnchorComment = {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; name: string; avatar: string | null };
};

/** A card's saved state, read back for the member who is looking at it. */
export type SportsAnchorEngagement = {
  postId: number;
  likesCount: number;
  commentsCount: number;
  viewerLiked: boolean;
  viewerSaved: boolean;
  comments: SportsAnchorComment[];
};

/** Keyed by `externalKey`, so a card can find its own state. */
export type SportsAnchorEngagementMap = Record<string, SportsAnchorEngagement>;

/** Bounded, URL-safe and lowercase: an id is only ever a key, never markup. */
const ANCHOR_ID = /^[a-z0-9][a-z0-9.:-]{0,159}$/;
/** Posts stay short; the feeds bound their own fields but this is the backstop. */
const MAX_CONTENT = 1200;

const slugify = (value: string) => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

/** Validate what a client sent. Anything else is refused, not coerced. */
export function anchorRef(kind: unknown, id: unknown): SportsAnchorRef | null {
  if (typeof kind !== 'string' || !(SPORTS_ANCHOR_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof id !== 'string' || !ANCHOR_ID.test(id)) return null;
  return { kind: kind as SportsAnchorKind, id };
}

export const anchorKey = (ref: SportsAnchorRef): string => `sports:${ref.kind}:${ref.id}`;

export const postKindFor = (ref: SportsAnchorRef): string => `sports_${ref.kind}`;

/**
 * One anchor per player, per metric, per sport. It stays stable while that
 * player leads that metric, so the discussion accumulates on one post instead of
 * a new one per refresh. The anchor keeps the wording it was created with — the
 * card always shows live values, the post is the conversation, not the stat.
 */
export const leaderAnchorId = (sport: SportsLeaderSport, row: Pick<SportsLeaderRow, 'metric' | 'key'>): string =>
  `${sport}:${slugify(row.metric)}:${slugify(row.key)}`;

/** ESPN's own video id, which the highlights feed already bounds and de-dupes. */
export const highlightAnchorId = (clip: Pick<SportsHighlightClip, 'id'>): string => slugify(clip.id);

const SPORT_MARK: Record<SportsLeaderSport, string> = { basketball: '🏀', football: '🏈' };

const bounded = (content: string) => content.slice(0, MAX_CONTENT);

/**
 * The post a leaders card would create. Only live boards are anchored: a sample
 * row is a placeholder while ESPN is unreachable, and placeholder values must
 * never be stored as though a member had posted them.
 */
export function leaderAnchorDraft(sport: SportsLeaderSport, league: string, row: SportsLeaderRow): SportsAnchorDraft | null {
  const ref = anchorRef('leader', leaderAnchorId(sport, row));
  if (!ref || !row.name || !row.value) return null;
  const where = row.team && row.team !== '—' ? `${row.team}${row.position ? ` · ${row.position}` : ''}` : '';
  return {
    ref,
    externalKey: anchorKey(ref),
    postKind: postKindFor(ref),
    content: bounded([
      `${SPORT_MARK[sport]} ${row.name} leads the ${league.toUpperCase()} in ${row.metric.toLowerCase()} with ${row.value}.`,
      where,
      '#Sports #Leaders #HyperSports',
    ].filter(Boolean).join('\n')),
    imageUrl: row.headshot,
    videoUrl: null,
  };
}

/** The post a highlight card would create, carrying ESPN's own clip media. */
export function highlightAnchorDraft(clip: SportsHighlightClip): SportsAnchorDraft | null {
  const ref = anchorRef('highlight', highlightAnchorId(clip));
  if (!ref || !clip.title) return null;
  const context = [clip.eventName && clip.eventName !== clip.title ? clip.eventName : '', clip.leagueName].filter(Boolean).join(' · ');
  return {
    ref,
    externalKey: anchorKey(ref),
    postKind: postKindFor(ref),
    content: bounded([
      `🎬 ${clip.title}`,
      context,
      clip.description?.trim() || '',
      '#Sports #Highlights #HyperSports',
    ].filter(Boolean).join('\n')),
    imageUrl: clip.thumbnail,
    videoUrl: clip.mp4,
  };
}
