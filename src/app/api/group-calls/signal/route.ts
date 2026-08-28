import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { hasDatabase } from '@/lib/prisma';
import { addSignal, getCallAccess, isParticipant, listSignals, pruneSignals } from '@/lib/group-call';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set(['offer', 'answer', 'ice', 'join', 'bye']);

function parsePositiveInt(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * GET /api/group-calls/signal?callId=<id>&after=<signalId>
 *
 * Returns signaling messages addressed to the signed-in user (offer/answer/ice
 * etc.). The client polls this to drive native WebRTC peer negotiation. Only
 * the user's own group members are allowed.
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
  const after = parsePositiveInt(req.nextUrl.searchParams.get('after')) ?? 0;

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    if (!access.isMember) {
      return NextResponse.json({ error: 'You do not have access to this call.' }, { status: 403 });
    }

    const signals = await listSignals(callId, viewer.id, after);
    const lastId = signals.length ? signals[signals.length - 1].id : after;
    if (lastId > 500) {
      await pruneSignals(callId, lastId - 500).catch(() => {});
    }

    return NextResponse.json(
      { signals, lastId },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.warn('[api/group-calls/signal] poll failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not poll call signals.' }, { status: 500 });
  }
}

/**
 * POST /api/group-calls/signal
 *
 * Relays a signaling message (SDP offer/answer or ICE candidate) to a peer in
 * the call. Only in-call participants may signal.
 */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  let body: { callId?: unknown; toId?: unknown; kind?: unknown; payload?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const callId = parsePositiveInt(typeof body.callId === 'number' ? String(body.callId) : (body.callId as string | null));
  if (!callId) {
    return NextResponse.json({ error: 'A valid callId is required.' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Invalid signaling kind.' }, { status: 400 });
  }
  const payload = typeof body.payload === 'string' ? body.payload : '';
  // Control signals ('bye', 'join') carry no body. Previously every kind was
  // required to have a payload, so the client's `bye` was rejected with a 400
  // and peers were left staring at a frozen tile until ICE timed out.
  const PAYLOAD_OPTIONAL = new Set(['bye', 'join']);
  if (!payload && !PAYLOAD_OPTIONAL.has(kind)) {
    return NextResponse.json({ error: 'A signaling payload is required.' }, { status: 400 });
  }
  if (payload.length > 100_000) {
    return NextResponse.json({ error: 'Signaling payload is too large.' }, { status: 413 });
  }
  // toId is optional — null broadcasts to everyone in the call.
  const toId = parsePositiveInt(typeof body.toId === 'number' ? String(body.toId) : (body.toId as string | null)) ?? null;

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    if (!access.isMember) {
      return NextResponse.json({ error: 'You do not have access to this call.' }, { status: 403 });
    }
    if (!access.call.isActive) {
      return NextResponse.json({ error: 'This call is no longer active.' }, { status: 410 });
    }
    if (toId !== null) {
      const targetOk = await isParticipant(callId, toId);
      if (!targetOk) {
        return NextResponse.json({ error: 'The target peer is not in the call.' }, { status: 400 });
      }
    }

    const id = await addSignal(callId, viewer.id, toId, kind, payload);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.warn('[api/group-calls/signal] send failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not send the signaling message.' }, { status: 500 });
  }
}
