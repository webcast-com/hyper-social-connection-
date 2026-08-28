import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { hasDatabase, prisma } from '@/lib/prisma';
import { buildRoomUrl, createCall, deactivateGroupCalls, endCall, findCallById, getCallAccess, listParticipants } from '@/lib/group-call';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GroupAccess = {
  group: { id: number; name: string; adminId: number };
  isMember: boolean;
};

function parsePositiveInt(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getGroupAccess(groupId: number, userId: number): Promise<GroupAccess | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, adminId: true },
  });
  if (!group) return null;

  if (group.adminId === userId) {
    return { group, isMember: true };
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { userId: true },
  });

  return { group, isMember: Boolean(membership) };
}

function parseActiveFilter(value: string | null): boolean | undefined | null {
  if (value === null || value === '') return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

/**
 * GET /api/group-calls?groupId=<id>&active=true
 *
 * Lists calls for a group. Call room data is member-only, including for
 * public groups, so a signed-in group member (or the group admin) is required.
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  const groupId = parsePositiveInt(req.nextUrl.searchParams.get('groupId'));
  if (!groupId) {
    return NextResponse.json({ error: 'A valid groupId query parameter is required.' }, { status: 400 });
  }

  const active = parseActiveFilter(req.nextUrl.searchParams.get('active'));
  if (active === null) {
    return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 });
  }

  try {
    const access = await getGroupAccess(groupId, viewer.id);
    if (!access) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }
    if (!access.isMember) {
      return NextResponse.json({ error: 'You must join this group to view its calls.' }, { status: 403 });
    }

    const calls = await prisma.groupCall.findMany({
      where: { groupId, ...(active === undefined ? {} : { isActive: active }) },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Attach the number of current participants to each call.
    const callsWithCounts = await Promise.all(
      calls.map(async (call) => ({
        ...call,
        participantCount: (await listParticipants(call.id)).length,
        // Signal that this is a native WebRTC call (no third-party URL).
        native: true,
      })),
    );

    return NextResponse.json(
      { calls: callsWithCounts },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.warn('[api/group-calls] query failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not load group calls.' }, { status: 500 });
  }
}

/**
 * POST /api/group-calls
 *
 * Creates a native WebRTC group call (no Daily/third-party room). Only a
 * signed-in member (or group admin) can start a call. Starting a new call
 * deactivates older call records for the same group.
 */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const groupId = parsePositiveInt(body.groupId as string | number | null);
  if (!groupId) {
    return NextResponse.json({ error: 'A valid groupId is required.' }, { status: 400 });
  }

  const suppliedTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const callType: 'video' | 'audio' = body.callType === 'audio' ? 'audio' : 'video';

  if (suppliedTitle.length > 120) {
    return NextResponse.json({ error: 'The call title must be 120 characters or fewer.' }, { status: 400 });
  }
  if (description.length > 500) {
    return NextResponse.json({ error: 'The description must be 500 characters or fewer.' }, { status: 400 });
  }

  try {
    const access = await getGroupAccess(groupId, viewer.id);
    if (!access) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }
    if (!access.isMember) {
      return NextResponse.json({ error: 'You must join this group before starting a call.' }, { status: 403 });
    }

    const title = suppliedTitle || `${access.group.name} call`;
    const token = randomUUID().replaceAll('-', '').slice(0, 16);
    const roomUrl = buildRoomUrl(groupId, token);

    await deactivateGroupCalls(groupId);
    const call = await createCall(groupId, viewer.id, title, description || null, roomUrl, callType);

    return NextResponse.json({ call }, { status: 201 });
  } catch (error) {
    console.warn('[api/group-calls] create failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not start the group call.' }, { status: 500 });
  }
}

/**
 * DELETE /api/group-calls?callId=<id>
 *
 * Ends a call for everyone. Restricted to the person who started it or the
 * group admin — a regular participant leaving should use
 * DELETE /api/group-calls/participants instead.
 */
export async function DELETE(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  const callId = parsePositiveInt(req.nextUrl.searchParams.get('callId'));
  if (!callId) {
    return NextResponse.json({ error: 'A valid callId query parameter is required.' }, { status: 400 });
  }

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });

    const group = await prisma.group.findUnique({
      where: { id: access.call.groupId },
      select: { adminId: true },
    });
    const isHost = access.call.creatorId === viewer.id || group?.adminId === viewer.id;
    if (!isHost) {
      return NextResponse.json(
        { error: 'Only the call host or group admin can end the call for everyone.' },
        { status: 403 },
      );
    }

    await endCall(callId);
    return NextResponse.json({ ended: true });
  } catch (error) {
    console.warn('[api/group-calls] end failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not end the call.' }, { status: 500 });
  }
}
