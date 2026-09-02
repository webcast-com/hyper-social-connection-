'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';
import { canViewProfileDetails } from '@/lib/profile';
import { buildProfileUrl, isShareChannel, type ShareChannel } from '@/lib/share';
import { getSiteUrl } from '@/lib/site-url';

async function getUserId(): Promise<number | null> {
  const viewer = await getViewer();
  return viewer?.id || null;
}

async function notify(userId: number, actorId: number, type: string, postId?: number) {
  if (userId === actorId) return;
  try {
    await prisma.notification.create({
      data: { userId, actorId, type, postId: postId ?? null, isRead: 0 },
    });
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
    await prisma.profileShare.create({
      data: { profileId, sharerId, channel, groupId: groupId ?? null },
    });
  } catch (e) {
    console.warn('[share:record]', (e as Error)?.message);
  }
}

/**
 * A profile can only be shared when the sharer is actually allowed to see it,
 * otherwise sharing would leak a private profile into a public feed.
 */
async function assertShareable(profileId: number, viewerId: number | null) {
  const profile = await prisma.user.findUnique({
    where: { id: profileId },
    select: { id: true, name: true, username: true, profileVisibility: true },
  });
  if (!profile) return { ok: false as const, message: 'Profile not found' };

  if (viewerId && viewerId !== profileId) {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: profileId },
          { blockerId: profileId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    if (blocked) return { ok: false as const, message: 'This profile is unavailable' };
  }

  const isFollower = viewerId
    ? !!(await prisma.follow.findFirst({
        where: { followerId: viewerId, followingId: profileId },
        select: { followerId: true },
      }))
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
      const membership = await prisma.groupMember.findFirst({
        where: { groupId, userId },
        select: { userId: true },
      });
      if (!membership) return { success: false, message: 'Join the group before sharing there' };
    }

    const post = await prisma.post.create({
      data: {
        userId,
        content: message || `Check out ${check.profile.name} on Hyper 👋`,
        sharedProfileId: profileId,
        groupId,
        privacy: 'public',
      },
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
    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId,
        content: `${body ? `${body}\n` : ''}👤 ${check.profile.name} — ${profileLink}`,
      },
    });
    await recordShare(profileId, userId, 'message');
    await notify(receiverId, userId, 'message');
    revalidatePath(`/messages/${receiverId}`);
    void message;
  } catch (e) {
    console.warn('[action:shareProfileToMessage]', (e as Error)?.message);
    return { success: false, message: 'Could not send that message' };
  }
  return { success: true, message: 'Profile sent' };
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
    const rows = await prisma.groupMember.findMany({
      where: { userId },
      include: { group: { select: { id: true, name: true, privacy: true, coverPhoto: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
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
    const rows = await prisma.follow.findMany({
      where: {
        followerId: userId,
        ...(needle
          ? {
              following: {
                OR: [
                  { name: { contains: needle, mode: 'insensitive' } },
                  { username: { contains: needle, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: { following: { select: { id: true, name: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => r.following);
  } catch (e) {
    console.warn('[action:getShareableRecipients]', (e as Error)?.message);
    return [];
  }
}

/** How many times a profile has been shared (shown on the profile page). */
export async function getProfileShareCount(profileId: number) {
  try {
    return await prisma.profileShare.count({ where: { profileId } });
  } catch {
    return 0;
  }
}
