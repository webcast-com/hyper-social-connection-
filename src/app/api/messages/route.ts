import { NextRequest, NextResponse } from 'next/server';
import { prisma, hasDatabase } from '@/lib/prisma';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/messages?with=<userId>&after=<messageId>
 *
 * Returns the signed-in user's conversation with `with`, optionally only
 * messages with id > `after`. Used by the chat UI to poll for new messages.
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const withId = Number(searchParams.get('with'));
  const after = Number(searchParams.get('after') || 0);

  if (!Number.isFinite(withId) || withId <= 0) {
    return NextResponse.json({ error: 'Missing "with" query parameter' }, { status: 400 });
  }

  if (!hasDatabase) {
    return NextResponse.json({ messages: [] });
  }

  try {
    const rows = await prisma.message.findMany({
      where: {
        id: { gt: Number.isFinite(after) ? after : 0 },
        OR: [
          { senderId: viewer.id, receiverId: withId },
          { senderId: withId, receiverId: viewer.id },
        ],
      },
      orderBy: { id: 'asc' },
      take: 200,
    });

    return NextResponse.json({
      messages: rows.map((r) => ({
        id: r.id,
        senderId: r.senderId,
        receiverId: r.receiverId,
        content: r.content,
        imageUrl: r.imageUrl || null,
        videoUrl: r.videoUrl || null,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.warn('[api/messages] query failed:', (err as Error)?.message);
    return NextResponse.json({ messages: [] });
  }
}
