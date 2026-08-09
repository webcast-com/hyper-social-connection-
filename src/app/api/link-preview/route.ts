import { NextResponse } from 'next/server';
import { fetchLinkPreview } from '@/lib/link-preview';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const preview = await fetchLinkPreview(url);
  if (!preview) {
    return NextResponse.json({ error: 'Could not fetch preview' }, { status: 404 });
  }

  return NextResponse.json(preview, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
