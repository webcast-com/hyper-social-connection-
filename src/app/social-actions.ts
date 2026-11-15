'use server';

import { db } from '@/lib/prisma';
import { and, or } from '@prisma/orm-postgres/orm-client';
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
    const existing = await db.orm.public.Block.where({ blockerId: userId, blockedId: targetId }).first();
    if (existing) {
      await db.orm.public.Block.where({ blockerId: userId, blockedId: targetId }).deleteAndCount();
      revalidatePath(`/profile/${targetId}`);
      revalidatePath('/');
      revalidatePath('/settings');
      return { success: true, blocked: false };
    }
    await db.orm.public.Block.create({ blockerId: userId, blockedId: targetId });
    await db.orm.public.Follow
      .where((m) => or(
        and(m.followerId.eq(userId), m.followingId.eq(targetId)),
        and(m.followerId.eq(targetId), m.followingId.eq(userId)),
      ))
      .deleteAndCount();
    await db.orm.public.FollowRequest
      .where((m) => or(
        and(m.followerId.eq(userId), m.followingId.eq(targetId)),
        and(m.followerId.eq(targetId), m.followingId.eq(userId)),
      ))
      .deleteAndCount();
    await db.orm.public.Mute.where({ muterId: userId, mutedId: targetId }).deleteAndCount();
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
    const existing = await db.orm.public.Mute.where({ muterId: userId, mutedId: targetId }).first();
    if (existing) {
      await db.orm.public.Mute.where({ muterId: userId, mutedId: targetId }).deleteAndCount();
      revalidatePath('/');
      revalidatePath(`/profile/${targetId}`);
      revalidatePath('/settings');
      return { success: true, muted: false };
    }
    await db.orm.public.Mute.create({ muterId: userId, mutedId: targetId });
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
    await db.orm.public.Report.create({
      reporterId: userId,
      reportedUserId: targetId,
      reason: reason || 'other',
      details: details || null,
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
    const req = await db.orm.public.FollowRequest
      .where({ followerId: requesterId, followingId: userId, status: 'pending' })
      .first();
    if (!req) return { success: false, message: 'Request not found' };

    if (decision === 'approved') {
      await db.orm.public.Follow.createAndCount([{ followerId: requesterId, followingId: userId }], { onConflict: 'skip' });
    }
    await db.orm.public.FollowRequest
      .where({ followerId: requesterId, followingId: userId })
      .updateAndCount({ status: decision });
    if (decision === 'approved') {
      await db.orm.public.Notification.create({ userId: requesterId, actorId: userId, type: 'follow', isRead: 0 }).catch(() => {});
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
    const group = await db.orm.public.Group.where({ id: groupId, adminId: userId }).select('id').first();
    if (!group) return { success: false, message: 'Only the owner can transfer this group' };

    const member = await db.orm.public.GroupMember.where({ groupId, userId: newOwnerId }).first();
    if (!member) return { success: false, message: 'The new owner must already be a member' };

    await db.orm.public.Group.where({ id: groupId }).update({ adminId: newOwnerId });
    await db.orm.public.GroupMember.where({ groupId, userId: newOwnerId }).updateAndCount({ role: 'admin' });
    await db.orm.public.GroupMember.where({ groupId, userId }).updateAndCount({ role: 'admin' });
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
    const membership = await db.orm.public.GroupMember.where({ groupId, userId }).select('role').first();
    const group = await db.orm.public.Group.where({ id: groupId }).select('adminId').first();
    const canCreate = group?.adminId === userId || membership?.role === 'admin' || membership?.role === 'moderator';
    if (!canCreate) return { success: false, message: 'Only admins or moderators can create events' };

    await db.orm.public.GroupEvent.create({
      groupId,
      createdById: userId,
      title: title.slice(0, 120),
      description: String(formData.get('description') || '').trim().slice(0, 400) || null,
      location: String(formData.get('location') || '').trim().slice(0, 120) || null,
      startsAt,
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
    const event = await db.orm.public.GroupEvent.where({ id: eventId }).select('groupId').first();
    if (!event) return { success: false };
    const member = await db.orm.public.GroupMember.where({ groupId: event.groupId, userId }).first();
    if (!member) return { success: false };

    if (status === 'none') {
      await db.orm.public.GroupEventRsvp.where({ eventId, userId }).deleteAndCount();
    } else {
      await db.orm.public.GroupEventRsvp.upsert({
        create: { eventId, userId, status },
        update: { status },
        conflictOn: { eventId, userId },
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
      db.orm.public.Block
        .where({ blockerId: userId })
        .include('blocked', (rel) => rel.select('id', 'name', 'username', 'avatar'))
        .all(),
      db.orm.public.Mute
        .where({ muterId: userId })
        .include('muted', (rel) => rel.select('id', 'name', 'username', 'avatar'))
        .all(),
      db.orm.public.FollowRequest
        .where({ followingId: userId, status: 'pending' })
        .include('follower', (rel) => rel.select('id', 'name', 'username', 'avatar'))
        .orderBy((o) => o.createdAt.desc())
        .all(),
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
