/**
 * Sports anchor posts — the database half.
 *
 * See `sports-anchor.ts` for what an anchor post is. This module answers three
 * questions:
 *
 *   1. who authors an anchor post — one system account, the Hyper Sports desk,
 *      created on first use and unable to sign in;
 *   2. what it says — always rebuilt from this site's own feeds, never from
 *      whatever a client sent, and never from a sample board;
 *   3. what a card should render — the saved likes, comments and bookmark for
 *      the member looking at it, in one bounded query per homepage render.
 *
 * `posts.kind` and `posts.external_key` are created by the boot DDL in
 * `src/lib/migrate.ts` and declared in `prisma/schema.prisma`. They are read and
 * written with parameterised SQL here so the anchor path keeps working before
 * `npm run db:generate` has been re-run; everything else (counts, comments,
 * likes, bookmarks) goes through Prisma as usual.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { hasDatabase, prisma } from '@/lib/prisma';
import { ensureMigrated } from '@/lib/migrate';
import { findStoredHighlightClip } from '@/lib/highlights-index';
import { isSafeMediaUrl } from '@/lib/media-url';
import { getSportsLeaderBoards } from './espn-leaders-feed';
import { getSportsHighlights } from './espn-highlights-feed';
import type { SportsLeaderBoard, SportsLeaderSport } from './espn-leaders';
import type { SportsHighlightsBoard } from './espn-highlights-feed';
import type { SportsHighlightClip } from './espn-highlights';
import {
  anchorKey,
  anchorRef,
  SPORTS_DESK,
  highlightAnchorDraft,
  highlightAnchorId,
  leaderAnchorDraft,
  leaderAnchorId,
  type SportsAnchorDraft,
  type SportsAnchorEngagement,
  type SportsAnchorEngagementMap,
  type SportsAnchorRef,
} from './sports-anchor';

export { SPORTS_DESK };

/** Bounds one homepage render: two leader boards plus the highlights list. */
const MAX_REFS = 60;
/** Comments carried per card; the count still reports the real total. */
const MAX_COMMENTS_PER_CARD = 12;

let deskPromise: Promise<number | null> | null = null;

/** Idempotent: the desk is created once, on the first anchor that needs it. */
export async function ensureSportsDesk(): Promise<number | null> {
  if (!hasDatabase) return null;
  if (deskPromise) return deskPromise;
  deskPromise = createSportsDesk().finally(() => { deskPromise = null; });
  return deskPromise;
}

async function createSportsDesk(): Promise<number | null> {
  await ensureMigrated();
  // A hash of a value that is discarded: the account exists, login never can.
  const password = await bcrypt.hash(randomUUID(), 10);
  const columns = `"name", "email", "username", "password", "bio", "account_type",
    "age", "gender", "relationship_status", "profile_visibility", "message_privacy", "follow_privacy",
    "notify_likes", "notify_comments", "notify_follows", "notify_messages"`;
  // The profile columns are spelled out because the physical columns are
  // nullable: omitting them would store NULL where Prisma's schema promises a
  // value, and the desk's own profile page would render blanks.
  // Notification toggles are off and messages are closed: the desk is an author,
  // not a member, so engagement on its anchors must not accumulate notifications
  // nobody will ever read.
  const values = '$1, $2, $3, $4, $5, \'broadcaster\', 18, \'male\', \'single\', \'public\', \'nobody\', \'everyone\', 0, 0, 0, 0';
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO "users" (${columns}) VALUES (${values})
       ON CONFLICT ("email") DO UPDATE SET "account_type" = 'broadcaster'
       RETURNING "id"`,
      SPORTS_DESK.name, SPORTS_DESK.email, SPORTS_DESK.username, password, SPORTS_DESK.bio,
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    // A member may already hold @hypersports; the desk does not need a handle.
    console.warn('[sports-desk] create with username failed, retrying without one:', (error as Error)?.message);
    try {
      const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO "users" (${columns}) VALUES (${values})
         ON CONFLICT ("email") DO UPDATE SET "account_type" = 'broadcaster'
         RETURNING "id"`,
        SPORTS_DESK.name, SPORTS_DESK.email, null, password, SPORTS_DESK.bio,
      );
      return rows[0]?.id ?? null;
    } catch (retryError) {
      console.warn('[sports-desk] unavailable:', (retryError as Error)?.message);
      const existing = await prisma.user.findUnique({ where: { email: SPORTS_DESK.email }, select: { id: true } });
      return existing?.id ?? null;
    }
  }
}

/**
 * Rebuild a card's draft from this site's own feeds. Sample boards are refused:
 * placeholder values must never be stored as though they were reported.
 */
export async function resolveAnchorDraft(ref: SportsAnchorRef): Promise<SportsAnchorDraft | null> {
  if (ref.kind === 'leader') {
    const boards = await getSportsLeaderBoards();
    for (const sport of ['basketball', 'football'] as SportsLeaderSport[]) {
      const board = boards[sport];
      if (board.status !== 'live') continue;
      const row = board.rows.find((candidate) => leaderAnchorId(sport, candidate) === ref.id);
      if (row) return leaderAnchorDraft(sport, board.league, row);
    }
    return null;
  }
  const board = await getSportsHighlights();
  if (board.status !== 'unavailable') {
    const clip = board.clips.find((candidate) => highlightAnchorId(candidate) === ref.id);
    if (clip) return highlightAnchorDraft(clip);
  }
  // A clip that has left the live board is still a real clip: the stored index
  // keeps every clip this site has read, so engagement on it resolves from there
  // instead of silently failing. Inert without a database, exactly like the rest
  // of this module.
  const stored = await findStoredHighlightClip(ref.id);
  return stored ? highlightAnchorDraft(stored) : null;
}

/** The anchor post for a card, created on first use from this site's own feed. */
export async function ensureAnchorPost(ref: SportsAnchorRef): Promise<number | null> {
  if (!hasDatabase) return null;
  const draft = await resolveAnchorDraft(ref);
  if (!draft) return null;
  return createAnchorPost(draft);
}

/**
 * Store a draft as the anchor post for its card. The unique index on
 * `posts.external_key` makes a double submit or two members clicking at the same
 * moment resolve to the same post instead of two.
 */
export async function createAnchorPost(draft: SportsAnchorDraft): Promise<number | null> {
  if (!hasDatabase) return null;
  const deskId = await ensureSportsDesk();
  if (!deskId) return null;
  await ensureMigrated();
  const imageUrl = isSafeMediaUrl(draft.imageUrl) ? draft.imageUrl : null;
  const videoUrl = isSafeMediaUrl(draft.videoUrl) ? draft.videoUrl : null;
  try {
    const inserted = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO "posts" ("user_id", "content", "image_url", "video_url", "privacy", "kind", "external_key")
       VALUES ($1, $2, $3, $4, 'public', $5, $6)
       ON CONFLICT ("external_key") DO NOTHING
       RETURNING "id"`,
      deskId, draft.content, imageUrl, videoUrl, draft.postKind, draft.externalKey,
    );
    if (inserted[0]?.id) return inserted[0].id;
  } catch (error) {
    console.warn('[sports-anchor] insert failed:', (error as Error)?.message);
  }
  // Already anchored — by an earlier interaction or by a concurrent one.
  try {
    const existing = await prisma.$queryRawUnsafe<{ id: number }[]>(
      'SELECT "id" FROM "posts" WHERE "external_key" = $1', draft.externalKey,
    );
    return existing[0]?.id ?? null;
  } catch (error) {
    console.warn('[sports-anchor] lookup failed:', (error as Error)?.message);
    return null;
  }
}

/**
 * Saved state for every card the page is about to render, in one pass: the
 * anchor ids, then counts, the viewer's own like and bookmark, and the visible
 * comments. Cards nobody has engaged with cost one row of the id query and
 * nothing else.
 */
export async function loadAnchorEngagement(refs: SportsAnchorRef[], viewerId: number | null): Promise<SportsAnchorEngagementMap> {
  const wanted = refs.slice(0, MAX_REFS);
  if (!hasDatabase || !wanted.length) return {};
  const keys = [...new Set(wanted.map(anchorKey))];
  if (!keys.length) return {};
  await ensureMigrated();

  let ids: { id: number; external_key: string }[] = [];
  try {
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    ids = await prisma.$queryRawUnsafe<{ id: number; external_key: string }[]>(
      `SELECT "id", "external_key" FROM "posts" WHERE "external_key" IN (${placeholders})`, ...keys,
    );
  } catch (error) {
    console.warn('[sports-anchor] engagement lookup failed:', (error as Error)?.message);
    return {};
  }
  if (!ids.length) return {};

  const postIds = ids.map((row) => row.id);
  const keyByPostId = new Map(ids.map((row) => [row.id, row.external_key]));
  try {
    const [posts, comments, liked, saved] = await Promise.all([
      prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, likesCount: true, commentsCount: true } }),
      prisma.comment.findMany({
        where: { postId: { in: postIds } },
        orderBy: { createdAt: 'asc' },
        take: MAX_COMMENTS_PER_CARD * postIds.length,
        include: { user: { select: { id: true, name: true, avatar: true } } },
      }),
      viewerId ? prisma.like.findMany({ where: { postId: { in: postIds }, userId: viewerId }, select: { postId: true } }) : Promise.resolve([]),
      viewerId ? prisma.bookmark.findMany({ where: { postId: { in: postIds }, userId: viewerId }, select: { postId: true } }) : Promise.resolve([]),
    ]);

    const commentsByPost = new Map<number, SportsAnchorEngagement['comments']>();
    for (const comment of comments) {
      const list = commentsByPost.get(comment.postId) ?? [];
      list.push({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        author: { id: comment.user.id, name: comment.user.name, avatar: comment.user.avatar },
      });
      commentsByPost.set(comment.postId, list);
    }
    const likedIds = new Set(liked.map((row) => row.postId));
    const savedIds = new Set(saved.map((row) => row.postId));

    const map: SportsAnchorEngagementMap = {};
    for (const post of posts) {
      const key = keyByPostId.get(post.id);
      if (!key) continue;
      const thread = commentsByPost.get(post.id) ?? [];
      map[key] = {
        postId: post.id,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        viewerLiked: likedIds.has(post.id),
        viewerSaved: savedIds.has(post.id),
        // The newest end of the thread is what a card shows; the count above is
        // the real total either way.
        comments: thread.slice(-MAX_COMMENTS_PER_CARD),
      };
    }
    return map;
  } catch (error) {
    console.warn('[sports-anchor] engagement load failed:', (error as Error)?.message);
    return {};
  }
}

/** Refs for the leaders boards, live boards only. */
export function leaderAnchorRefs(boards: Record<SportsLeaderSport, SportsLeaderBoard>): SportsAnchorRef[] {
  const refs: SportsAnchorRef[] = [];
  for (const sport of ['basketball', 'football'] as SportsLeaderSport[]) {
    const board = boards[sport];
    if (board.status !== 'live') continue;
    for (const row of board.rows) {
      const ref = anchorRef('leader', leaderAnchorId(sport, row));
      if (ref) refs.push(ref);
    }
  }
  return refs;
}

/**
 * Refs for a list of highlight clips, real clips only.
 *
 * Split out from the board because a page can render clips the board does not
 * hold: the stored index keeps every clip this site has read, and each of those
 * cards engages through the same anchor as the homepage card for the same clip.
 */
export function highlightClipsAnchorRefs(clips: Pick<SportsHighlightClip, 'id'>[], limit = MAX_REFS): SportsAnchorRef[] {
  return clips.slice(0, limit)
    .map((clip) => anchorRef('highlight', highlightAnchorId(clip)))
    .filter((ref): ref is SportsAnchorRef => ref !== null);
}

/** Refs for the highlights board, real clips only. A sample board has none. */
export function highlightAnchorRefs(board: SportsHighlightsBoard, limit = MAX_REFS): SportsAnchorRef[] {
  if (board.status === 'unavailable') return [];
  return highlightClipsAnchorRefs(board.clips, limit);
}
