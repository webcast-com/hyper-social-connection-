'use server';

import { db } from '@/lib/prisma';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';

async function getUserId(): Promise<number | null> {
  const viewer = await getViewer();
  return viewer?.id || null;
}

async function notify(userId: number, actorId: number, type: string) {
  if (userId === actorId) return;
  try {
    await db.orm.public.Notification.create({ userId, actorId, type, isRead: 0 });
  } catch (e) {
    console.warn('[invite:notify]', (e as Error)?.message);
  }
}

/**
 * Who is allowed to invite into a group: the owner, admins and moderators
 * always; ordinary members only when the group is public.
 */
async function canInvite(groupId: number, userId: number) {
  const group = await db.orm.public.Group
    .where({ id: groupId })
    .select('id', 'name', 'adminId', 'privacy')
    .first();
  if (!group) return { ok: false as const, message: 'Group not found' };

  if (group.adminId === userId) return { ok: true as const, group };

  const membership = await db.orm.public.GroupMember.where({ groupId, userId }).select('role').first();
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

    const invitee = await db.orm.public.User.where({ id: inviteeId }).select('id', 'name').first();
    if (!invitee) return { success: false, message: 'That person could not be found' };

    const blocked = await db.orm.public.Block
      .where((m) => or(
        and(m.blockerId.eq(userId), m.blockedId.eq(inviteeId)),
        and(m.blockerId.eq(inviteeId), m.blockedId.eq(userId)),
      ))
      .select('blockerId')
      .first();
    if (blocked) return { success: false, message: 'You cannot invite this person' };

    const alreadyMember = await db.orm.public.GroupMember
      .where({ groupId, userId: inviteeId })
      .select('userId')
      .first();
    if (alreadyMember) return { success: false, message: `${invitee.name} is already a member` };

    // Re-send an earlier invite, or create a new one; (group, invitee) is
    // unique in the database, so a concurrent double submit is skipped.
    const note = (message || '').trim().slice(0, 300) || null;
    const resent = await db.orm.public.GroupInvite
      .where({ groupId, inviteeId })
      .update({ status: 'pending', inviterId: userId, message: note, createdAt: new Date() });
    if (!resent) {
      await db.orm.public.GroupInvite.createAndCount(
        [{ groupId, inviterId: userId, inviteeId, message: note }],
        { onConflict: 'skip', conflictOn: ['groupId', 'inviteeId'] },
      );
    }

    await notify(inviteeId, userId, 'group_invite');
    revalidatePath('/groups/[id]', 'page');
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
    const target = await db.orm.public.User
      .where((m) => or(m.email.eq(needle), m.username.eq(needle)))
      .select('id')
      .first();
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
    const invite = await db.orm.public.GroupInvite
      .where({ id: inviteId })
      .select('id', 'groupId', 'inviteeId', 'inviterId', 'status')
      .first();
    if (!invite || invite.inviteeId !== userId) {
      return { success: false, message: 'Invite not found' };
    }
    if (invite.status !== 'pending') {
      return { success: false, message: 'This invite was already handled' };
    }

    if (decision === 'accepted') {
      await db.orm.public.GroupMember.upsert({
        create: { groupId: invite.groupId, userId, role: 'member' },
        update: {},
        conflictOn: { groupId: invite.groupId, userId },
      });
      await db.orm.public.GroupJoinRequest.where({ groupId: invite.groupId, userId }).deleteAndCount();
      await notify(invite.inviterId, userId, 'group_invite_accepted');
    }

    await db.orm.public.GroupInvite.where({ id: inviteId }).update({ status: decision });

    revalidatePath('/groups/[id]', 'page');
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
    const invite = await db.orm.public.GroupInvite
      .where({ id: inviteId })
      .select('id', 'groupId', 'inviterId')
      .include('group', (rel) => rel.select('adminId'))
      .first();
    if (!invite) return { success: false, message: 'Invite not found' };
    if (invite.inviterId !== userId && invite.group?.adminId !== userId) {
      return { success: false, message: 'You cannot cancel this invite' };
    }
    await db.orm.public.GroupInvite.where({ id: inviteId }).delete();
    revalidatePath('/groups/[id]', 'page');
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
    const rows = await db.orm.public.GroupInvite
      .where({ inviteeId: userId, status: 'pending' })
      .include('group', (rel) => rel.select('id', 'name', 'coverPhoto', 'privacy', 'description'))
      .include('inviter', (rel) => rel.select('id', 'name', 'username', 'avatar'))
      .orderBy((o) => o.createdAt.desc())
      .limit(30)
      .all();
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
    const rows = await db.orm.public.GroupInvite
      .where({ groupId, status: 'pending' })
      .include('invitee', (rel) => rel.select('id', 'name', 'username', 'avatar'))
      .include('inviter', (rel) => rel.select('id', 'name'))
      .orderBy((o) => o.createdAt.desc())
      .limit(50)
      .all();
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
    const followed = db.orm.public.Follow.where({ followerId: userId });
    const [follows, members, invites] = await Promise.all([
      (needle
        ? followed.where((f) => f.following.some((u) => or(u.name.ilike(`%${needle}%`), u.username.ilike(`%${needle}%`))))
        : followed)
        .include('following', (rel) => rel.select('id', 'name', 'username', 'avatar'))
        .limit(50)
        .all(),
      db.orm.public.GroupMember.where({ groupId }).select('userId').all(),
      db.orm.public.GroupInvite.where({ groupId, status: 'pending' }).select('inviteeId').all(),
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
