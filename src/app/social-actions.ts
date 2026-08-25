'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';

async function getUserId() {
  const viewer = await getViewer();
  return viewer?.id || null;
}

export async function toggleBlock(targetId: number) {
  const userId = await getUserId();
  if (!userId || userId === targetId) return { success: false, blocked: false };
  try {
    const existing = await prisma.block.findFirst({
      where: { blockerId: userId, blockedId: targetId },
    });
    if (existing) {
      await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
      revalidatePath(`/profile/${targetId}`);
      revalidatePath('/');
      revalidatePath('/settings');
      return { success: true, blocked: false };
    }
    await prisma.block.create({ data: { blockerId: userId, blockedId: targetId } });
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: targetId },
          { followerId: targetId, followingId: userId },
        ],
      },
    });
    await prisma.followRequest.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: targetId },
          { followerId: targetId, followingId: userId },
        ],
      },
    });
    await prisma.mute.deleteMany({ where: { muterId: userId, mutedId: targetId } });
  } catch (e) {
    console.warn('[action:toggleBlock]', (e as Error)?.message);
    return { success: false, blocked: false };
  }
  revalidatePath(`/profile/${targetId}`);
  revalidatePath('/');
  revalidatePath('/settings');
  return { success: true, blocked: true };
}

export async function toggleMute(targetId: number) {
  const userId = await getUserId();
  if (!userId || userId === targetId) return { success: false, muted: false };
  try {
    const existing = await prisma.mute.findFirst({
      where: { muterId: userId, mutedId: targetId },
    });
    if (existing) {
      await prisma.mute.deleteMany({ where: { muterId: userId, mutedId: targetId } });
      revalidatePath('/');
      revalidatePath(`/profile/${targetId}`);
      revalidatePath('/settings');
      return { success: true, muted: false };
    }
    await prisma.mute.create({ data: { muterId: userId, mutedId: targetId } });
  } catch (e) {
    console.warn('[action:toggleMute]', (e as Error)?.message);
    return { success: false, muted: false };
  }
  revalidatePath('/');
  revalidatePath(`/profile/${targetId}`);
  revalidatePath('/settings');
  return { success: true, muted: true };
}

export async function reportUser(targetId: number, reason: string, details?: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  if (userId === targetId) return { success: false, message: 'You cannot report yourself' };
  try {
    await prisma.report.create({
      data: {
        reporterId: userId,
        reportedUserId: targetId,
        reason: reason || 'other',
        details: details || null,
      },
    });
  } catch (e) {
    console.warn('[action:reportUser]', (e as Error)?.message);
  }
  return { success: true, message: 'Report submitted.' };
}

export async function reviewFollowRequest(requesterId: number, decision: 'approved' | 'declined') {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  try {
    const req = await prisma.followRequest.findFirst({
      where: { followerId: requesterId, followingId: userId, status: 'pending' },
    });
    if (!req) return { success: false, message: 'Request not found' };

    if (decision === 'approved') {
      await prisma.follow.createMany({
        data: { followerId: requesterId, followingId: userId },
        skipDuplicates: true,
      });
    }
    await prisma.followRequest.updateMany({
      where: { followerId: requesterId, followingId: userId },
      data: { status: decision },
    });
    if (decision === 'approved') {
      await prisma.notification.create({
        data: { userId: requesterId, actorId: userId, type: 'follow', isRead: 0 },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('[action:reviewFollowRequest]', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath('/settings');
  revalidatePath('/notifications');
  revalidatePath(`/profile/${userId}`);
  return { success: true };
}

export async function transferGroupOwnership(groupId: number, newOwnerId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  if (newOwnerId === userId) return { success: false, message: 'You already own this group' };
  try {
    const group = await prisma.group.findFirst({
      where: { id: groupId, adminId: userId },
      select: { id: true },
    });
    if (!group) return { success: false, message: 'Only the owner can transfer this group' };

    const member = await prisma.groupMember.findFirst({
      where: { groupId, userId: newOwnerId },
    });
    if (!member) return { success: false, message: 'The new owner must already be a member' };

    await prisma.group.update({
      where: { id: groupId },
      data: { adminId: newOwnerId },
    });
    await prisma.groupMember.updateMany({
      where: { groupId, userId: newOwnerId },
      data: { role: 'admin' },
    });
    await prisma.groupMember.updateMany({
      where: { groupId, userId },
      data: { role: 'admin' },
    });
  } catch (e) {
    console.warn('[action:transferGroupOwnership]', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true, message: 'Ownership transferred' };
}

export async function createGroupEvent(groupId: number, formData: FormData) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  const title = String(formData.get('title') || '').trim();
  const startsAtRaw = String(formData.get('startsAt') || '');
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  if (!title) return { success: false, message: 'Give the event a title' };
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { success: false, message: 'Pick a valid date and time' };
  }
  try {
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId },
      select: { role: true },
    });
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { adminId: true } });
    const canCreate = group?.adminId === userId || membership?.role === 'admin' || membership?.role === 'moderator';
    if (!canCreate) return { success: false, message: 'Only admins or moderators can create events' };

    await prisma.groupEvent.create({
      data: {
        groupId,
        createdById: userId,
        title: title.slice(0, 120),
        description: String(formData.get('description') || '').trim().slice(0, 400) || null,
        location: String(formData.get('location') || '').trim().slice(0, 120) || null,
        startsAt,
      },
    });
  } catch (e) {
    console.warn('[action:createGroupEvent]', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function rsvpGroupEvent(eventId: number, status: 'going' | 'maybe' | 'none') {
  const userId = await getUserId();
  if (!userId) return { success: false };
  try {
    const event = await prisma.groupEvent.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    });
    if (!event) return { success: false };
    const member = await prisma.groupMember.findFirst({
      where: { groupId: event.groupId, userId },
    });
    if (!member) return { success: false };

    if (status === 'none') {
      await prisma.groupEventRsvp.deleteMany({ where: { eventId, userId } });
    } else {
      await prisma.groupEventRsvp.upsert({
        where: { eventId_userId: { eventId, userId } },
        update: { status },
        create: { eventId, userId, status },
      });
    }
    revalidatePath(`/groups/${event.groupId}`);
  } catch (e) {
    console.warn('[action:rsvpGroupEvent]', (e as Error)?.message);
    return { success: false };
  }
  return { success: true };
}

export async function getSafetyLists() {
  const userId = await getUserId();
  if (!userId) return { blocked: [], muted: [], followRequests: [] };
  try {
    const [blocked, muted, followRequests] = await Promise.all([
      prisma.block.findMany({
        where: { blockerId: userId },
        include: { blocked: { select: { id: true, name: true, username: true, avatar: true } } },
      }),
      prisma.mute.findMany({
        where: { muterId: userId },
        include: { muted: { select: { id: true, name: true, username: true, avatar: true } } },
      }),
      prisma.followRequest.findMany({
        where: { followingId: userId, status: 'pending' },
        include: { follower: { select: { id: true, name: true, username: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      blocked: blocked.map((b) => b.blocked),
      muted: muted.map((m) => m.muted),
      followRequests: followRequests.map((r) => r.follower),
    };
  } catch (e) {
    console.warn('[action:getSafetyLists]', (e as Error)?.message);
    return { blocked: [], muted: [], followRequests: [] };
  }
}
