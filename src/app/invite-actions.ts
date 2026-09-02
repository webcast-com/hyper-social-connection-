'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';

async function getUserId(): Promise<number | null> {
  const viewer = await getViewer();
  return viewer?.id || null;
}

async function notify(userId: number, actorId: number, type: string) {
  if (userId === actorId) return;
  try {
    await prisma.notification.create({
      data: { userId, actorId, type, isRead: 0 },
    });
  } catch (e) {
    console.warn('[invite:notify]', (e as Error)?.message);
  }
}

/**
 * Who is allowed to invite into a group: the owner, admins and moderators
 * always; ordinary members only when the group is public.
 */
async function canInvite(groupId: number, userId: number) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, adminId: true, privacy: true },
  });
  if (!group) return { ok: false as const, message: 'Group not found' };

  if (group.adminId === userId) return { ok: true as const, group };

  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
    select: { role: true },
  });
  if (!membership) return { ok: false as const, message: 'Join the group before inviting people' };

  if (membership.role === 'admin' || membership.role === 'moderator') {
    return { ok: true as const, group };
  }
  if (group.privacy === 'public') return { ok: true as const, group };

  return { ok: false as const, message: 'Only admins and moderators can invite to a private group' };
}

/** Invite a user (by id) to a group. Creates a pending invite + notification. */
export async function inviteUserToGroup(groupId: number, inviteeId: number, message?: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to invite people' };
  if (inviteeId === userId) return { success: false, message: 'You cannot invite yourself' };

  try {
    const permission = await canInvite(groupId, userId);
    if (!permission.ok) return { success: false, message: permission.message };

    const invitee = await prisma.user.findUnique({
      where: { id: inviteeId },
      select: { id: true, name: true },
    });
    if (!invitee) return { success: false, message: 'That person could not be found' };

    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: inviteeId },
          { blockerId: inviteeId, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    });
    if (blocked) return { success: false, message: 'You cannot invite this person' };

    const alreadyMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: inviteeId },
      select: { userId: true },
    });
    if (alreadyMember) return { success: false, message: `${invitee.name} is already a member` };

    await prisma.groupInvite.upsert({
      where: { groupId_inviteeId: { groupId, inviteeId } },
      update: {
        status: 'pending',
        inviterId: userId,
        message: (message || '').trim().slice(0, 300) || null,
        createdAt: new Date(),
      },
      create: {
        groupId,
        inviterId: userId,
        inviteeId,
        message: (message || '').trim().slice(0, 300) || null,
      },
    });

    await notify(inviteeId, userId, 'group_invite');
    revalidatePath(`/groups/${groupId}`);
    revalidatePath('/groups');
    revalidatePath('/notifications');
    return { success: true, message: `Invite sent to ${invitee.name}` };
  } catch (e) {
    console.warn('[action:inviteUserToGroup]', (e as Error)?.message);
    return { success: false, message: 'Could not send that invite' };
  }
}

/** Invite by @username or email — used by the "invite people" search box. */
export async function inviteToGroupByHandle(groupId: number, query: string, message?: string) {
  const needle = (query || '').trim().replace(/^@/, '').toLowerCase();
  if (!needle) return { success: false, message: 'Enter a username or email' };
  try {
    const target = await prisma.user.findFirst({
      where: { OR: [{ email: needle }, { username: needle }] },
      select: { id: true },
    });
    if (!target) return { success: false, message: 'No user found with that username or email' };
    return await inviteUserToGroup(groupId, target.id, message);
  } catch (e) {
    console.warn('[action:inviteToGroupByHandle]', (e as Error)?.message);
    return { success: false, message: 'Could not send that invite' };
  }
}

/** The invitee accepts or declines. Accepting adds them to the group. */
export async function respondToGroupInvite(inviteId: number, decision: 'accepted' | 'declined') {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in to respond' };

  try {
    const invite = await prisma.groupInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, groupId: true, inviteeId: true, inviterId: true, status: true },
    });
    if (!invite || invite.inviteeId !== userId) {
      return { success: false, message: 'Invite not found' };
    }
    if (invite.status !== 'pending') {
      return { success: false, message: 'This invite was already handled' };
    }

    if (decision === 'accepted') {
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId } },
        update: {},
        create: { groupId: invite.groupId, userId, role: 'member' },
      });
      await prisma.groupJoinRequest.deleteMany({ where: { groupId: invite.groupId, userId } });
      await notify(invite.inviterId, userId, 'group_invite_accepted');
    }

    await prisma.groupInvite.update({
      where: { id: inviteId },
      data: { status: decision },
    });

    revalidatePath(`/groups/${invite.groupId}`);
    revalidatePath('/groups');
    revalidatePath('/notifications');
    return {
      success: true,
      message: decision === 'accepted' ? 'You joined the group' : 'Invite declined',
      groupId: invite.groupId,
    };
  } catch (e) {
    console.warn('[action:respondToGroupInvite]', (e as Error)?.message);
    return { success: false, message: 'Could not update that invite' };
  }
}

/** An inviter (or group admin) cancels a pending invite. */
export async function cancelGroupInvite(inviteId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Sign in first' };
  try {
    const invite = await prisma.groupInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, groupId: true, inviterId: true, group: { select: { adminId: true } } },
    });
    if (!invite) return { success: false, message: 'Invite not found' };
    if (invite.inviterId !== userId && invite.group.adminId !== userId) {
      return { success: false, message: 'You cannot cancel this invite' };
    }
    await prisma.groupInvite.delete({ where: { id: inviteId } });
    revalidatePath(`/groups/${invite.groupId}`);
    return { success: true, message: 'Invite cancelled' };
  } catch (e) {
    console.warn('[action:cancelGroupInvite]', (e as Error)?.message);
    return { success: false, message: 'Could not cancel that invite' };
  }
}

/** Pending invites addressed to the signed-in user. */
export async function getMyGroupInvites() {
  const userId = await getUserId();
  if (!userId) return [];
  try {
    const rows = await prisma.groupInvite.findMany({
      where: { inviteeId: userId, status: 'pending' },
      include: {
        group: { select: { id: true, name: true, coverPhoto: true, privacy: true, description: true } },
        inviter: { select: { id: true, name: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.createdAt,
      group: r.group,
      inviter: r.inviter,
    }));
  } catch (e) {
    console.warn('[action:getMyGroupInvites]', (e as Error)?.message);
    return [];
  }
}

/** Pending invites sent for a group (shown to admins). */
export async function getGroupPendingInvites(groupId: number) {
  const userId = await getUserId();
  if (!userId) return [];
  try {
    const permission = await canInvite(groupId, userId);
    if (!permission.ok) return [];
    const rows = await prisma.groupInvite.findMany({
      where: { groupId, status: 'pending' },
      include: {
        invitee: { select: { id: true, name: true, username: true, avatar: true } },
        inviter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      invitee: r.invitee,
      inviter: r.inviter,
      createdAt: r.createdAt,
    }));
  } catch (e) {
    console.warn('[action:getGroupPendingInvites]', (e as Error)?.message);
    return [];
  }
}

/**
 * Candidates to invite: people the viewer follows who are not already members
 * and have no pending invite. Optional name/username filter.
 */
export async function getInviteCandidates(groupId: number, query = '') {
  const userId = await getUserId();
  if (!userId) return [];
  const needle = (query || '').trim().replace(/^@/, '');
  try {
    const [follows, members, invites] = await Promise.all([
      prisma.follow.findMany({
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
        take: 50,
      }),
      prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
      prisma.groupInvite.findMany({
        where: { groupId, status: 'pending' },
        select: { inviteeId: true },
      }),
    ]);

    const excluded = new Set<number>([
      ...members.map((m) => m.userId),
      ...invites.map((i) => i.inviteeId),
    ]);
    return follows
      .map((f) => f.following)
      .filter((u) => u && !excluded.has(u.id))
      .slice(0, 20);
  } catch (e) {
    console.warn('[action:getInviteCandidates]', (e as Error)?.message);
    return [];
  }
}
