import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { hasDatabase, prisma } from '@/lib/prisma';

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

function isDailyRoomUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'daily.co' || url.hostname.endsWith('.daily.co'));
  } catch {
    return false;
  }
}

async function createDailyRoom(groupId: number, audioOnly: boolean) {
  // DAILY_API_KEY is intentionally server-only. NEXT_PUBLIC_DAILY_API_KEY is
  // accepted for compatibility with older deployments, but should be migrated.
  const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY;
  if (!apiKey) {
    throw new Error('DAILY_NOT_CONFIGURED');
  }

  const roomName = `hyper-group-${groupId}-${randomUUID().replaceAll('-', '').slice(0, 14)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 4 * 60 * 60;
  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'public',
      properties: {
        exp: expiresAt,
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: audioOnly,
      },
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !payload?.url || !isDailyRoomUrl(payload.url)) {
    console.warn('[api/group-calls] Daily room creation failed:', response.status);
    throw new Error('DAILY_CREATE_FAILED');
  }

  return payload.url;
}

/**
 * GET /api/group-calls?groupId=<id>&active=true
 *
 * Lists calls for a group. Call room URLs are member-only, including for
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

    return NextResponse.json(
      { calls },
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
 * Creates a four-hour Daily room and broadcasts it to the group. Only a
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
  const audioOnly = body.callType === 'audio';

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

    const roomUrl = await createDailyRoom(groupId, audioOnly);
    const title = suppliedTitle || `${access.group.name} call`;

    const call = await prisma.$transaction(async (tx) => {
      await tx.groupCall.updateMany({
        where: { groupId, isActive: true },
        data: { isActive: false },
      });
      return tx.groupCall.create({
        data: {
          groupId,
          creatorId: viewer.id,
          title,
          description: description || null,
          roomUrl,
        },
        include: {
          creator: { select: { id: true, name: true, avatar: true } },
        },
      });
    });

    return NextResponse.json({ call }, { status: 201 });
  } catch (error) {
    const message = (error as Error)?.message;
    if (message === 'DAILY_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'Video calling is not configured. Add DAILY_API_KEY to the server environment.' },
        { status: 503 },
      );
    }
    if (message === 'DAILY_CREATE_FAILED') {
      return NextResponse.json(
        { error: 'The video room provider could not create a room. Please try again.' },
        { status: 502 },
      );
    }

    console.warn('[api/group-calls] create failed:', message);
    return NextResponse.json({ error: 'Could not start the group call.' }, { status: 500 });
  }
}
