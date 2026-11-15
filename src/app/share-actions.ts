'use server';

import { db } from '@/lib/prisma';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';
import { canViewProfileDetails } from '@/lib/profile';
import { buildProfileUrl, isShareChannel, postPath, type ShareChannel } from '@/lib/share';
import { getSiteUrl } from '@/lib/site-url';

async function getUserId(): Promise<number | null> {
  const viewer = await getViewer();
  return viewer?.id || null;
}

async function notify(userId: number, actorId: number, type: string, postId?: number) {
  if (userId === actorId) return;
  try {
    await db.orm.public.Notification.create({ userId, actorId, type, postId: postId ?? null, isRead: 0 });
  } catch (e) {
    console.warn('[share:notify]', (e as Error)?.message);
  }
}

/** Records one share of a profile. Never throws — analytics must not break UX. */
async function recordShare(
  profileId: number,
  sharerId: number | null,
  channel: ShareChannel,
  groupId?: number | null,
) {
  try {
    await db.orm.public.ProfileShare.create({ profileId, sharerId, channel, groupId: groupId ?? null });
  } catch (e) {
    console.warn('[share:record]', (e as Error)?.message);
  }
}

/**
 * A profile can only be shared when the sharer is actually allowed to see it,
 * otherwise sharing would leak a private profile into a public feed.
 */
async function assertShareable(profileId: number, viewerId: number | null) {
  const profile = await db.orm.public.User
    .where({ id: profileId })
    .select('id', 'name', 'username', 'profileVisibility')
    .first();
  if (!profile) return { ok: false as const, message: 'Profile not found' };

  if (viewerId && viewerId !== profileId) {
    const blocked = await db.orm.public.Block
      .where((m) => or(
        and(m.blockerId.eq(viewerId), m.blockedId.eq(profileId)),
        and(m.blockerId.eq(profileId), m.blockedId.eq(viewerId)),
      ))
      .select('blockerId')
      .first();
    if (blocked) return { ok: false as const, message: 'This profile is unavailable' };
  }

  const isFollower = viewerId
    ? !!(await db.orm.public.Follow
      .where({ followerId: viewerId, followingId: profileId })
      .select('followerId')
      .first())
    : false;

  const visible = canViewProfileDetails({
    isSelf: viewerId === profileId,
    isFollower,
    visibility: profile.profileVisibility,
  });
  if (!visible) return { ok: false as const, message: 'This profile is private and cannot be shared' };

  return { ok: true as const, profile };
}

/**
 * Share a profile as a post — either to the sharer's own feed (groupId null)
 * or into a group they belong to. The post carries `sharedProfileId` so the
 * feed can render a rich profile card.
 */
export async function shareProfileToFeed(
  profileId: number,
  options: { message?: string; groupId?: number | null } = {},
) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share profiles' };

  const groupId = options.groupId ?? null;
  const message = (options.message || '').trim().slice(0, 500);

  try {
    const check = await assertShareable(profileId, userId);
    if (!check.ok) return { success: false, message: check.message };

    if (groupId) {
      const membership = await db.orm.public.GroupMember.where({ groupId, userId }).select('userId').first();
      if (!membership) return { success: false, message: 'Join the group before sharing there' };
    }

    const post = await db.orm.public.Post.create({
      userId,
      content: message || `Check out ${check.profile.name} on Hyper 👋`,
      sharedProfileId: profileId,
      groupId,
      privacy: 'public',
    });

    await recordShare(profileId, userId, groupId ? 'group' : 'feed', groupId);
    await notify(profileId, userId, 'profile_share', post.id);
  } catch (e) {
    console.warn('[action:shareProfileToFeed]', (e as Error)?.message);
    return { success: false, message: 'Could not share right now' };
  }

  revalidatePath('/');
  revalidatePath(`/profile/${userId}`);
  revalidatePath(`/profile/${profileId}`);
  if (groupId) revalidatePath(`/groups/${groupId}`);
  return { success: true, message: groupId ? 'Shared to the group' : 'Shared to your feed' };
}

/** Send a profile to another user as a direct message. */
export async function shareProfileToMessage(profileId: number, receiverId: number, note?: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share profiles' };
  if (receiverId === userId) return { success: false, message: 'Pick someone to send this to' };

  try {
    const check = await assertShareable(profileId, userId);
    if (!check.ok) return { success: false, message: check.message };

    const body = (note || '').trim().slice(0, 400);
    // Absolute link — chat renders plain text, and the link should stay
    // valid if the recipient copies it out of the app.
    const profileLink = buildProfileUrl(getSiteUrl(), profileId, check.profile.username ?? null);
    const sent = await deliverShareMessage(
      userId,
      receiverId,
      `${body ? `${body}\n` : ''}👤 ${check.profile.name} — ${profileLink}`,
    );
    if (!sent.success) return sent;
    await recordShare(profileId, userId, 'message');
  } catch (e) {
    console.warn('[action:shareProfileToMessage]', (e as Error)?.message);
    return { success: false, message: 'Could not send that message' };
  }
  return { success: true, message: 'Profile sent' };
}

/* ── Posts, and everything else the share sheet carries ─────────────────── */

type ShareResult = { success: boolean; message: string };

/** A note or a caption stays inside what the composers already allow. */
const MAX_NOTE = 500;
const MAX_CONTENT = 2000;

/**
 * Puts one shared item in somebody's inbox.
 *
 * The receiver comes from the client, so this applies the rules an ordinary
 * message is held to (`sendMessage`): nothing crosses a block in either
 * direction, and a member who takes messages from nobody, or only from people
 * they are connected to, is not reached by a share either. The sheet lists
 * people the sharer follows; this is what makes that list a courtesy rather
 * than the check.
 */
async function deliverShareMessage(senderId: number, receiverId: number, content: string): Promise<ShareResult> {
  if (!Number.isInteger(receiverId) || receiverId <= 0 || receiverId === senderId) {
    return { success: false, message: 'Pick someone to send this to' };
  }
  const target = await db.orm.public.User.where({ id: receiverId }).select('id', 'messagePrivacy', 'notifyMessages').first();
  if (!target) return { success: false, message: 'That person could not be found' };

  const blocked = await db.orm.public.Block
    .where((m) => or(
      and(m.blockerId.eq(senderId), m.blockedId.eq(receiverId)),
      and(m.blockerId.eq(receiverId), m.blockedId.eq(senderId)),
    ))
    .select('blockerId')
    .first();
  const unavailable = { success: false, message: 'You cannot send messages to this person' };
  if (blocked) return unavailable;

  const privacy = target.messagePrivacy || 'everyone';
  if (privacy === 'nobody') return unavailable;
  if (privacy === 'followers') {
    const connected = await db.orm.public.Follow
      .where((m) => or(
        and(m.followerId.eq(senderId), m.followingId.eq(receiverId)),
        and(m.followerId.eq(receiverId), m.followingId.eq(senderId)),
      ))
      .select('followerId')
      .first();
    if (!connected) return unavailable;
  }

  await db.orm.public.Message.create({ senderId, receiverId, content });
  // The message always arrives; the alert about it respects the receiver's setting.
  if (target.notifyMessages !== 0) await notify(receiverId, senderId, 'message');
  revalidatePath(`/messages/${receiverId}`);
  return { success: true, message: 'Sent' };
}

/**
 * May this member pass this post on?
 *
 * A post that is not published yet is its author's alone, a block in either
 * direction hides both members' posts from each other, and a post written inside
 * a group that is not public stays in that group: it can be shared with the
 * group's own members, and nowhere a non-member would read it.
 */
async function assertPostShareable(postId: number, viewerId: number, intoGroupId: number | null) {
  const missing = { ok: false as const, message: 'This post is unavailable' };
  if (!Number.isInteger(postId) || postId <= 0) return missing;
  const post = await db.orm.public.Post
    .where({ id: postId })
    .include('user', (rel) => rel.select('id', 'name'))
    .include('group', (rel) => rel.select('id', 'privacy'))
    .first();
  if (!post) return missing;
  if (post.scheduledAt && post.scheduledAt.getTime() > Date.now() && post.userId !== viewerId) return missing;

  if (post.userId !== viewerId) {
    const blocked = await db.orm.public.Block
      .where((m) => or(
        and(m.blockerId.eq(viewerId), m.blockedId.eq(post.userId)),
        and(m.blockerId.eq(post.userId), m.blockedId.eq(viewerId)),
      ))
      .select('blockerId')
      .first();
    if (blocked) return missing;
  }

  if (post.group && post.group.privacy !== 'public' && intoGroupId !== post.group.id) {
    return { ok: false as const, message: 'Posts from a private group can only be shared inside that group' };
  }
  return { ok: true as const, post };
}

/** One line that says what a shared post is, for a message that carries its link. */
function postLabel(post: { content: string; user?: { name: string | null } | null }) {
  const text = post.content.replace(/\s+/g, ' ').trim();
  const snippet = text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text;
  const author = post.user?.name?.trim();
  return [author, snippet ? `“${snippet}”` : ''].filter(Boolean).join(': ') || 'A post on Hyper';
}

/**
 * Share a post — to the sharer's own feed, or into a group they belong to. It
 * is a repost: the new post carries `repostOfId`, so the original is shown inside
 * it and its author hears about it, exactly as with the repost this replaces.
 */
export async function sharePostToFeed(
  postId: number,
  options: { message?: string; groupId?: number | null } = {},
): Promise<ShareResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share posts' };

  const groupId = options.groupId ?? null;
  const message = (options.message || '').trim().slice(0, MAX_NOTE);

  try {
    if (groupId) {
      const membership = await db.orm.public.GroupMember.where({ groupId, userId }).select('userId').first();
      if (!membership) return { success: false, message: 'Join the group before sharing there' };
    }
    const check = await assertPostShareable(postId, userId, groupId);
    if (!check.ok) return { success: false, message: check.message };

    const post = await db.orm.public.Post.create({
      userId,
      content: message || '🔁 Reposted',
      repostOfId: postId,
      groupId,
      privacy: 'public',
    });
    await notify(check.post.userId, userId, 'repost', post.id);
  } catch (e) {
    console.warn('[action:sharePostToFeed]', (e as Error)?.message);
    return { success: false, message: 'Could not share right now' };
  }

  revalidatePath('/');
  revalidatePath(`/profile/${userId}`);
  revalidatePath('/notifications');
  if (groupId) revalidatePath(`/groups/${groupId}`);
  return { success: true, message: groupId ? 'Shared to the group' : 'Shared to your feed' };
}

/** Send a post to another member as a direct message: a line about it, and its link. */
export async function sharePostToMessage(postId: number, receiverId: number, note?: string): Promise<ShareResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share posts' };

  try {
    const check = await assertPostShareable(postId, userId, null);
    if (!check.ok) return { success: false, message: check.message };
    const body = (note || '').trim().slice(0, MAX_NOTE);
    const link = `${getSiteUrl().replace(/\/+$/, '')}${postPath(postId)}`;
    const sent = await deliverShareMessage(userId, receiverId, `${body ? `${body}\n` : ''}📝 ${postLabel(check.post)} — ${link}`);
    return sent.success ? { success: true, message: 'Post sent' } : sent;
  } catch (e) {
    console.warn('[action:sharePostToMessage]', (e as Error)?.message);
    return { success: false, message: 'Could not send that message' };
  }
}

/**
 * Share something that is not a post of its own — a league clip, a match, a
 * prediction — as a post about it, to the sharer's feed or a group they belong
 * to. The text is the member's own post, written by the card they shared from;
 * it is held to the same length a post is and published under their name, the
 * way the cards' own Share has always worked.
 */
export async function shareContentToFeed(
  content: string,
  options: { groupId?: number | null } = {},
): Promise<ShareResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share' };
  const text = (typeof content === 'string' ? content : '').trim().slice(0, MAX_CONTENT);
  if (!text) return { success: false, message: 'There is nothing to share' };
  const groupId = options.groupId ?? null;

  try {
    if (groupId) {
      const membership = await db.orm.public.GroupMember.where({ groupId, userId }).select('userId').first();
      if (!membership) return { success: false, message: 'Join the group before sharing there' };
    }
    await db.orm.public.Post.create({ userId, content: text, groupId, privacy: 'public' });
  } catch (e) {
    console.warn('[action:shareContentToFeed]', (e as Error)?.message);
    return { success: false, message: 'Could not share right now' };
  }

  revalidatePath('/');
  revalidatePath(`/profile/${userId}`);
  if (groupId) revalidatePath(`/groups/${groupId}`);
  return { success: true, message: groupId ? 'Shared to the group' : 'Shared to your feed' };
}

/** Send that same text to one member as a direct message. */
export async function shareContentToMessage(receiverId: number, content: string): Promise<ShareResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to share' };
  const text = (typeof content === 'string' ? content : '').trim().slice(0, MAX_CONTENT);
  if (!text) return { success: false, message: 'There is nothing to send' };
  try {
    return await deliverShareMessage(userId, receiverId, text);
  } catch (e) {
    console.warn('[action:shareContentToMessage]', (e as Error)?.message);
    return { success: false, message: 'Could not send that message' };
  }
}

/**
 * Logs an off-platform share (Facebook, WhatsApp, YouTube, TikTok, …) or a
 * copied link. The redirect itself happens client-side; this only counts it.
 */
export async function recordProfileShare(profileId: number, channel: string) {
  if (!isShareChannel(channel)) return { success: false };
  const userId = await getUserId();
  await recordShare(profileId, userId, channel);
  revalidatePath(`/profile/${profileId}`);
  return { success: true };
}

/** Groups the viewer can share into (their memberships). */
export async function getShareableGroups() {
  const userId = await getUserId();
  if (!userId) return [];
  try {
    const rows = await db.orm.public.GroupMember
      .where({ userId })
      .include('group', (rel) => rel.select('id', 'name', 'privacy', 'coverPhoto'))
      .orderBy((o) => o.createdAt.desc())
      .limit(50)
      .all();
    return rows.map((r) => r.group).filter(Boolean);
  } catch (e) {
    console.warn('[action:getShareableGroups]', (e as Error)?.message);
    return [];
  }
}

/** People the viewer can DM a profile to (who they follow, most recent first). */
export async function getShareableRecipients(query = '') {
  const userId = await getUserId();
  if (!userId) return [];
  const needle = query.trim().replace(/^@/, '');
  try {
    const follows = db.orm.public.Follow.where({ followerId: userId });
    const rows = await (needle
      ? follows.where((f) => f.following.some((u) => or(u.name.ilike(`%${needle}%`), u.username.ilike(`%${needle}%`))))
      : follows)
      .include('following', (rel) => rel.select('id', 'name', 'username', 'avatar'))
      .orderBy((o) => o.createdAt.desc())
      .limit(20)
      .all();
    return rows.map((r) => r.following);
  } catch (e) {
    console.warn('[action:getShareableRecipients]', (e as Error)?.message);
    return [];
  }
}

/** How many times a profile has been shared (shown on the profile page). */
export async function getProfileShareCount(profileId: number) {
  try {
    return (await db.orm.public.ProfileShare.where({ profileId }).aggregate((a) => ({ n: a.count() }))).n;
  } catch {
    return 0;
  }
}
