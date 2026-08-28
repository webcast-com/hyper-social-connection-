import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { hasDatabase } from '@/lib/prisma';
import {
  getCallAccess,
  joinCall,
  leaveCall,
  listParticipants,
  reapStaleParticipants,
  updateParticipantState,
  type ParticipantState,
} from '@/lib/group-call';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * GET /api/group-calls/participants?callId=<id>
 *
 * Returns the current in-call participants. Access is restricted to the call
 * creator, the group admin, or a group member.
 */
export async function GET(req: NextRequest) {
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
    if (!access.isMember) {
      return NextResponse.json({ error: 'You do not have access to this call.' }, { status: 403 });
    }

    // Drop peers whose heartbeat stopped (closed tab / lost network) so the
    // grid does not keep a frozen tile for someone who is long gone.
    await reapStaleParticipants(callId).catch(() => {});
    const participants = await listParticipants(callId);
    return NextResponse.json(
      { participants, callType: access.call.callType },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.warn('[api/group-calls/participants] query failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not load call participants.' }, { status: 500 });
  }
}

/**
 * POST /api/group-calls/participants?callId=<id>
 *
 * Registers the signed-in user as a participant so other peers can discover
 * and connect to them. Idempotent — joining an already-joined call is a no-op.
 */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  const callId = parsePositiveInt(req.nextUrl.searchParams.get('callId'));
  if (!callId) {
    return NextResponse.json({ error: 'A valid callId query parameter is required.' }, { status: 400 });
  }

  // navigator.sendBeacon can only issue POST, so the page-unload handler marks
  // its request with ?beacon=leave. Treat it as a leave rather than a join —
  // otherwise closing the tab would re-add the participant it just removed.
  if (req.nextUrl.searchParams.get('beacon') === 'leave') {
    try {
      await leaveCall(callId, viewer.id);
    } catch {
      /* best effort */
    }
    return NextResponse.json({ left: true });
  }

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    if (!access.isMember) {
      return NextResponse.json({ error: 'You must join this group before joining a call.' }, { status: 403 });
    }
    if (!access.call.isActive) {
      return NextResponse.json({ error: 'This call is no longer active.' }, { status: 410 });
    }

    await joinCall(callId, viewer.id);
    const participants = await listParticipants(callId);

    return NextResponse.json(
      { participants, joined: true, callType: access.call.callType },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.warn('[api/group-calls/participants] join failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not join the call.' }, { status: 500 });
  }
}

/**
 * DELETE /api/group-calls/participants?callId=<id>
 *
 * Removes the signed-in user from the call. Idempotent.
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

    await leaveCall(callId, viewer.id);
    return NextResponse.json({ left: true });
  } catch (error) {
    console.warn('[api/group-calls/participants] leave failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not leave the call.' }, { status: 500 });
  }
}

/**
 * PATCH /api/group-calls/participants?callId=<id>
 *
 * Updates the viewer's live state (muted / camera / screen-sharing / raised
 * hand) and refreshes their heartbeat. Sending an empty body is a valid
 * keepalive — that is how we detect participants whose tab disappeared.
 */
export async function PATCH(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  const callId = parsePositiveInt(req.nextUrl.searchParams.get('callId'));
  if (!callId) {
    return NextResponse.json({ error: 'A valid callId query parameter is required.' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    body = {}; // bare heartbeat
  }

  const state: ParticipantState = {};
  if (typeof body.isMuted === 'boolean') state.isMuted = body.isMuted;
  if (typeof body.isCameraOff === 'boolean') state.isCameraOff = body.isCameraOff;
  if (typeof body.isSharing === 'boolean') state.isSharing = body.isSharing;
  if (typeof body.handRaised === 'boolean') state.handRaised = body.handRaised;

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    if (!access.isMember) {
      return NextResponse.json({ error: 'You do not have access to this call.' }, { status: 403 });
    }

    await updateParticipantState(callId, viewer.id, state);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.warn('[api/group-calls/participants] state update failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not update call state.' }, { status: 500 });
  }
}
