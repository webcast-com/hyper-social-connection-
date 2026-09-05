/**
 * Native WebRTC group-call data access.
 *
 * The browser peers connect to each other directly over WebRTC, but the
 * *signaling* (who is in the call, SDP offers/answers, ICE candidates) has to
 * be relayed somewhere. We use the existing Postgres database as the relay —
 * the same way the chat client already polls /api/messages. No third-party
 * provider (Daily, etc.) or API key is required.
 *
 * The signaling tables and call-state extensions are bootstrapped by
 * src/lib/migrate.ts. Read calls here, rather than through the base Prisma
 * GroupCall model, so fields such as call_type are never dropped from the API.
 */

import { prisma } from '@/lib/prisma';

export type CallType = 'video' | 'audio';

export type GroupCallRow = {
  id: number;
  groupId: number;
  creatorId: number;
  title: string;
  description: string | null;
  roomUrl: string;
  callType: CallType;
  isActive: boolean;
  createdAt: Date;
  endedAt: Date | null;
};

export type GroupCallParticipantRow = {
  userId: number;
  name: string;
  avatar: string | null;
  joinedAt: Date;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharing: boolean;
  handRaisedAt: Date | null;
  lastSeenAt: Date;
};

export type GroupCallMessageRow = {
  id: number;
  callId: number;
  userId: number;
  name: string;
  avatar: string | null;
  body: string;
  createdAt: Date;
};

/** Participants quiet for longer than this are treated as gone (crashed tab). */
export const PARTICIPANT_STALE_SECONDS = 25;

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
            description, room_url AS "roomUrl", call_type AS "callType",
            is_active AS "isActive", created_at AS "createdAt",
            ended_at AS "endedAt"
       FROM group_calls WHERE id = $1`,
    callId,
  );
  return rows[0] ?? null;
}

export type GroupCallDetails = GroupCallRow & {
  creator: { id: number; name: string; avatar: string | null };
  participantCount: number;
};

/** The lobby needs the same call type and creator shape as the create response. */
export async function listGroupCalls(groupId: number, active?: boolean): Promise<GroupCallDetails[]> {
  return prisma.$queryRawUnsafe<GroupCallDetails[]>(
    `SELECT c.id, c.group_id AS "groupId", c.creator_id AS "creatorId", c.title,
            c.description, c.room_url AS "roomUrl", c.call_type AS "callType",
            c.is_active AS "isActive", c.created_at AS "createdAt", c.ended_at AS "endedAt",
            json_build_object('id', u.id, 'name', u.name, 'avatar', u.avatar) AS creator,
            (SELECT COUNT(*)::int FROM group_call_participants p
              WHERE p.call_id = c.id
                AND p.last_seen_at > now() - ($3 || ' seconds')::interval) AS "participantCount"
       FROM group_calls c JOIN users u ON u.id = c.creator_id
      WHERE c.group_id = $1 AND ($2::boolean IS NULL OR c.is_active = $2)
      ORDER BY c.created_at DESC, c.id DESC LIMIT 50`,
    groupId,
    active ?? null,
    String(PARTICIPANT_STALE_SECONDS),
  );
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
    `UPDATE group_calls SET is_active = false, ended_at = now()
      WHERE group_id = $1 AND is_active = true`,
    groupId,
  );
}

export async function createCall(
  groupId: number,
  creatorId: number,
  title: string,
  description: string | null,
  roomUrl: string,
  callType: CallType = 'video',
): Promise<GroupCallRow> {
  const rows = await prisma.$queryRawUnsafe<GroupCallRow[]>(
    `INSERT INTO group_calls (group_id, creator_id, title, description, room_url, call_type, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING id, group_id AS "groupId", creator_id AS "creatorId", title,
               description, room_url AS "roomUrl", call_type AS "callType",
               is_active AS "isActive", created_at AS "createdAt",
               ended_at AS "endedAt"`,
    groupId,
    creatorId,
    title,
    description,
    roomUrl,
    callType,
  );
  return rows[0];
}

/** Start a fresh peer session and return the signal cursor from before joining. */
export async function joinCall(callId: number, userId: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ lastId: number }[]>(
      `SELECT COALESCE(MAX(id), 0)::int AS "lastId" FROM group_call_signals WHERE call_id = $1`,
      callId,
    );
    // A rejoin must not replay SDP/ICE or a bye from this user's previous peer
    // connection. Other participants' negotiations are left untouched.
    await tx.$executeRawUnsafe(
      `DELETE FROM group_call_signals WHERE call_id = $1 AND (from_id = $2 OR to_id = $2)`,
      callId,
      userId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO group_call_participants (call_id, user_id, last_seen_at)
       VALUES ($1, $2, now())
       ON CONFLICT (call_id, user_id)
       DO UPDATE SET joined_at = now(), last_seen_at = now(), is_muted = false,
                     is_camera_off = false, is_sharing = false, hand_raised_at = NULL`,
      callId,
      userId,
    );
    return rows[0].lastId;
  });
}

export async function leaveCall(callId: number, userId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.$executeRawUnsafe(
      `DELETE FROM group_call_participants WHERE call_id = $1 AND user_id = $2`,
      callId,
      userId,
    );
    // The server sends bye atomically with removal. A browser closing a tab
    // cannot reliably send a separate signal before its leave request.
    if (removed) {
      await tx.$executeRawUnsafe(
        `INSERT INTO group_call_signals (call_id, from_id, to_id, kind, payload)
         VALUES ($1, $2, NULL, 'bye', '')`,
        callId,
        userId,
      );
    }
  });
}

export async function listParticipants(callId: number): Promise<GroupCallParticipantRow[]> {
  const rows = await prisma.$queryRawUnsafe<GroupCallParticipantRow[]>(
    `SELECT p.user_id AS "userId", u.name, u.avatar, p.joined_at AS "joinedAt",
            p.is_muted AS "isMuted", p.is_camera_off AS "isCameraOff",
            p.is_sharing AS "isSharing", p.hand_raised_at AS "handRaisedAt",
            p.last_seen_at AS "lastSeenAt"
       FROM group_call_participants p
       JOIN users u ON u.id = p.user_id
      WHERE p.call_id = $1
        AND p.last_seen_at > now() - ($2 || ' seconds')::interval
      ORDER BY p.joined_at ASC`,
    callId,
    String(PARTICIPANT_STALE_SECONDS),
  );
  return rows;
}

export async function isParticipant(callId: number, userId: number): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM group_call_participants
      WHERE call_id = $1 AND user_id = $2
        AND last_seen_at > now() - ($3 || ' seconds')::interval`,
    callId,
    userId,
    String(PARTICIPANT_STALE_SECONDS),
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
export async function pruneSignals(callId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM group_call_signals WHERE call_id = $1 AND created_at < now() - interval '5 minutes'`,
    callId,
  );
}

// ── Live participant state ───────────────────────────────────────────────────

export type ParticipantState = {
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSharing?: boolean;
  handRaised?: boolean;
};

/**
 * Update the viewer's live state and refresh their heartbeat.
 *
 * Called on every mute/camera/share/hand toggle and on a periodic keepalive.
 * Only the fields present in `state` are written, so a heartbeat with no
 * fields simply bumps `last_seen_at`.
 */
export async function updateParticipantState(
  callId: number,
  userId: number,
  state: ParticipantState,
): Promise<boolean> {
  const sets: string[] = ['last_seen_at = now()'];
  const values: unknown[] = [callId, userId];

  const push = (fragment: string, value: unknown) => {
    values.push(value);
    sets.push(`${fragment} = $${values.length}`);
  };

  if (typeof state.isMuted === 'boolean') push('is_muted', state.isMuted);
  if (typeof state.isCameraOff === 'boolean') push('is_camera_off', state.isCameraOff);
  if (typeof state.isSharing === 'boolean') push('is_sharing', state.isSharing);
  if (typeof state.handRaised === 'boolean') {
    // Store a timestamp so the UI can order raised hands fairly (first up, first called on).
    sets.push(state.handRaised ? 'hand_raised_at = COALESCE(hand_raised_at, now())' : 'hand_raised_at = NULL');
  }

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE group_call_participants SET ${sets.join(', ')} WHERE call_id = $1 AND user_id = $2`,
    ...values,
  );
  return updated > 0;
}

/** Remove participants who stopped sending heartbeats (closed laptop, crashed tab). */
export async function reapStaleParticipants(callId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM group_call_participants
      WHERE call_id = $1
        AND last_seen_at < now() - ($2 || ' seconds')::interval`,
    callId,
    String(PARTICIPANT_STALE_SECONDS * 2),
  );
}

// ── Ending a call ────────────────────────────────────────────────────────────

/** Mark a single call ended. Used by the host "End call for everyone" control. */
export async function endCall(callId: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE group_calls SET is_active = false, ended_at = now() WHERE id = $1 AND is_active = true`,
    callId,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM group_call_participants WHERE call_id = $1`, callId);
}

// ── In-call chat ─────────────────────────────────────────────────────────────

export const MAX_CALL_MESSAGE_LENGTH = 500;

export async function addCallMessage(
  callId: number,
  userId: number,
  body: string,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `INSERT INTO group_call_messages (call_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
    callId,
    userId,
    body,
  );
  return rows[0].id;
}

/** Chat messages after `afterId`. Unlike signals, the sender's own rows are included. */
export async function listCallMessages(
  callId: number,
  afterId: number,
): Promise<GroupCallMessageRow[]> {
  return prisma.$queryRawUnsafe<GroupCallMessageRow[]>(
    `SELECT m.id, m.call_id AS "callId", m.user_id AS "userId", u.name, u.avatar,
            m.body, m.created_at AS "createdAt"
       FROM group_call_messages m
       JOIN users u ON u.id = m.user_id
      WHERE m.call_id = $1 AND m.id > $2
      ORDER BY m.id ASC
      LIMIT 100`,
    callId,
    afterId,
  );
}
