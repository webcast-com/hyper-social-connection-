/**
 * Native WebRTC group-call data access.
 *
 * The browser peers connect to each other directly over WebRTC, but the
 * *signaling* (who is in the call, SDP offers/answers, ICE candidates) has to
 * be relayed somewhere. We use the existing Postgres database as the relay —
 * the same way the chat client already polls /api/messages. No third-party
 * provider (Daily, etc.) or API key is required.
 *
 * These tables are created idempotently by src/lib/migrate.ts on boot and are
 * intentionally *not* modelled in prisma/schema.prisma (they are reachable
 * only via raw SQL), so the generated Prisma client does not need to be
 * regenerated.
 */

import { prisma } from '@/lib/prisma';

export type GroupCallRow = {
  id: number;
  groupId: number;
  creatorId: number;
  title: string;
  description: string | null;
  roomUrl: string;
  isActive: boolean;
  createdAt: Date;
};

export type GroupCallParticipantRow = {
  userId: number;
  name: string;
  avatar: string | null;
  joinedAt: Date;
};

export type GroupCallSignalRow = {
  id: number;
  callId: number;
  fromId: number;
  toId: number | null;
  kind: string;
  payload: string;
  createdAt: Date;
};

/** Build the stable native WebRTC room identifier stored in room_url. */
export function buildRoomUrl(groupId: number, token: string): string {
  return `webrtc://call/hyper-group-${groupId}-${token}`;
}

export async function findCallById(callId: number): Promise<GroupCallRow | null> {
  const rows = await prisma.$queryRawUnsafe<GroupCallRow[]>(
    `SELECT id, group_id AS "groupId", creator_id AS "creatorId", title,
            description, room_url AS "roomUrl", is_active AS "isActive",
            created_at AS "createdAt"
       FROM group_calls WHERE id = $1`,
    callId,
  );
  return rows[0] ?? null;
}

export type GroupAccess = { call: GroupCallRow; isMember: boolean };

/**
 * Resolve a call and verify the given user may access it (they are the call
 * creator, the group admin, or a group member). Returns null when the call
 * does not exist.
 */
export async function getCallAccess(callId: number, userId: number): Promise<GroupAccess | null> {
  const call = await findCallById(callId);
  if (!call) return null;

  if (call.creatorId === userId) return { call, isMember: true };

  const rows = await prisma.$queryRawUnsafe<{ adminId: number }[]>(
    `SELECT admin_id AS "adminId" FROM groups WHERE id = $1`,
    call.groupId,
  );
  if (rows[0]?.adminId === userId) return { call, isMember: true };

  const mem = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM group_members WHERE group_id = $1 AND user_id = $2`,
    call.groupId,
    userId,
  );
  const isMember = Number(mem[0]?.n ?? 0) > 0;
  return { call, isMember };
}

export async function deactivateGroupCalls(groupId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE group_calls SET is_active = false WHERE group_id = $1 AND is_active = true`,
    groupId,
  );
}

export async function createCall(
  groupId: number,
  creatorId: number,
  title: string,
  description: string | null,
  roomUrl: string,
): Promise<GroupCallRow> {
  const rows = await prisma.$queryRawUnsafe<GroupCallRow[]>(
    `INSERT INTO group_calls (group_id, creator_id, title, description, room_url, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, group_id AS "groupId", creator_id AS "creatorId", title,
               description, room_url AS "roomUrl", is_active AS "isActive",
               created_at AS "createdAt"`,
    groupId,
    creatorId,
    title,
    description,
    roomUrl,
  );
  return rows[0];
}

/** Upsert the viewer as an in-call participant. */
export async function joinCall(callId: number, userId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO group_call_participants (call_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (call_id, user_id) DO NOTHING`,
    callId,
    userId,
  );
}

export async function leaveCall(callId: number, userId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM group_call_participants WHERE call_id = $1 AND user_id = $2`,
    callId,
    userId,
  );
}

export async function listParticipants(callId: number): Promise<GroupCallParticipantRow[]> {
  const rows = await prisma.$queryRawUnsafe<GroupCallParticipantRow[]>(
    `SELECT p.user_id AS "userId", u.name, u.avatar, p.joined_at AS "joinedAt"
       FROM group_call_participants p
       JOIN users u ON u.id = p.user_id
      WHERE p.call_id = $1
      ORDER BY p.joined_at ASC`,
    callId,
  );
  return rows;
}

export async function isParticipant(callId: number, userId: number): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM group_call_participants WHERE call_id = $1 AND user_id = $2`,
    callId,
    userId,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function addSignal(
  callId: number,
  fromId: number,
  toId: number | null,
  kind: string,
  payload: string,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `INSERT INTO group_call_signals (call_id, from_id, to_id, kind, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    callId,
    fromId,
    toId,
    kind,
    payload,
  );
  return rows[0].id;
}

/**
 * Return signals addressed to the viewer (to_id = userId, or a broadcast with
 * to_id IS NULL) created after `afterId`. Signals authored by the viewer are
 * excluded so we never re-process our own messages.
 */
export async function listSignals(
  callId: number,
  userId: number,
  afterId: number,
): Promise<GroupCallSignalRow[]> {
  const rows = await prisma.$queryRawUnsafe<GroupCallSignalRow[]>(
    `SELECT id, call_id AS "callId", from_id AS "fromId", to_id AS "toId",
            kind, payload, created_at AS "createdAt"
       FROM group_call_signals
      WHERE call_id = $1
        AND id > $2
        AND from_id <> $3
        AND (to_id = $3 OR to_id IS NULL)
      ORDER BY id ASC
      LIMIT 200`,
    callId,
    afterId,
    userId,
  );
  return rows;
}

/** Drop old signals for a call so the table does not grow unbounded. */
export async function pruneSignals(callId: number, keepAfterId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM group_call_signals WHERE call_id = $1 AND id < $2`,
    callId,
    keepAfterId,
  );
}
