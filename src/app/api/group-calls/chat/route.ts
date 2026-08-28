import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { hasDatabase } from '@/lib/prisma';
import {
  addCallMessage,
  getCallAccess,
  listCallMessages,
  MAX_CALL_MESSAGE_LENGTH,
} from '@/lib/group-call';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * GET /api/group-calls/chat?callId=<id>&after=<messageId>
 *
 * Incremental in-call chat. Stored in its own table rather than the signaling
 * relay so that pruning old SDP/ICE rows never deletes chat history.
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

    const messages = await listCallMessages(callId, after);
    const lastId = messages.length ? messages[messages.length - 1].id : after;
    return NextResponse.json(
      { messages, lastId },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.warn('[api/group-calls/chat] poll failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not load call chat.' }, { status: 500 });
  }
}

/** POST /api/group-calls/chat — send a chat message to everyone in the call. */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Group calls require a connected database.' }, { status: 503 });
  }

  let body: { callId?: unknown; body?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const callId = parsePositiveInt(body.callId as string | number | null);
  if (!callId) {
    return NextResponse.json({ error: 'A valid callId is required.' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  }
  if (text.length > MAX_CALL_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Messages must be ${MAX_CALL_MESSAGE_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const access = await getCallAccess(callId, viewer.id);
    if (!access) return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    if (!access.isMember) {
      return NextResponse.json({ error: 'You do not have access to this call.' }, { status: 403 });
    }
    if (!access.call.isActive) {
      return NextResponse.json({ error: 'This call is no longer active.' }, { status: 410 });
    }

    const id = await addCallMessage(callId, viewer.id, text);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.warn('[api/group-calls/chat] send failed:', (error as Error)?.message);
    return NextResponse.json({ error: 'Could not send the message.' }, { status: 500 });
  }
}
