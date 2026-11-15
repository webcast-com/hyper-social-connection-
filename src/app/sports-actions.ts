'use server';

import { getViewer } from '@/lib/viewer';
import { anchorRef } from '@/lib/sports-anchor';
import { ensureAnchorPost } from '@/lib/sports-anchor-store';
import { createComment, toggleBookmark, toggleLike } from './actions';
import { sharePostToFeed, sharePostToMessage } from './share-actions';

/**
 * Engagement for the sports cards on the homepage.
 *
 * A card is provider data, so it has no post to like or comment on until a
 * member asks for one. Each action here resolves the card's identity, creates
 * its anchor post on first use (see `sports-anchor-store.ts`) and then hands
 * over to the same actions a member's post uses — so counts, notifications,
 * bookmarks, reposts and revalidation behave identically, and there is exactly
 * one implementation of each. They are shaped as form actions
 * (`(formData) => Promise<void>`), the way `Post.tsx` drives `toggleLike` and
 * `createComment`: the server responds, the page revalidates, and the numbers a
 * card shows come back from the database.
 *
 * The client sends a kind and an id and nothing else. The post's text and media
 * are rebuilt from this site's own feeds, so these actions cannot be used to
 * publish arbitrary content as the sports desk, and a sample board (ESPN
 * unreachable) refuses to anchor at all — the card stays read-only.
 */

/** Comments and quotes stay inside the bounds the composer already implies. */
const MAX_TEXT = 2000;

const boundedText = (value: FormDataEntryValue | null) =>
  (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');

async function anchorPostId(kind: string, id: string): Promise<number | null> {
  const viewer = await getViewer();
  if (!viewer?.id) return null;
  const ref = anchorRef(kind, id);
  if (!ref) return null;
  return ensureAnchorPost(ref);
}

/** Like or unlike a card. */
export async function likeSportsAnchor(kind: string, id: string): Promise<void> {
  const postId = await anchorPostId(kind, id);
  if (!postId) return;
  await toggleLike(postId);
}

/** Comment on a card, into the same thread every other member sees. */
export async function commentOnSportsAnchor(kind: string, id: string, formData: FormData): Promise<void> {
  const body = boundedText(formData.get('content'));
  if (!body) return;
  const postId = await anchorPostId(kind, id);
  if (!postId) return;
  const payload = new FormData();
  payload.set('content', body);
  await createComment(postId, payload);
}

/** Save a card to the member's bookmarks, listed in the Saved section of their profile. */
export async function saveSportsAnchor(kind: string, id: string): Promise<void> {
  const postId = await anchorPostId(kind, id);
  if (!postId) return;
  await toggleBookmark(postId);
}

/**
 * Share a card from the share sheet: into the member's feed or one of their
 * groups, as a repost of the card's post, with an optional note. The card is
 * anchored first, like any other engagement with it, and from there it is a
 * post being shared — the same rules, the same notification.
 */
export async function shareSportsAnchorToFeed(
  kind: string,
  id: string,
  options: { message?: string; groupId?: number | null } = {},
): Promise<{ success: boolean; message: string }> {
  const postId = await anchorPostId(kind, id);
  if (!postId) return { success: false, message: 'This card cannot be shared right now' };
  return sharePostToFeed(postId, options);
}

/** Send a card to one member as a direct message, by the link to its post. */
export async function shareSportsAnchorToMessage(
  kind: string,
  id: string,
  receiverId: number,
  note?: string,
): Promise<{ success: boolean; message: string }> {
  const postId = await anchorPostId(kind, id);
  if (!postId) return { success: false, message: 'This card cannot be sent right now' };
  return sharePostToMessage(postId, receiverId, note);
}
