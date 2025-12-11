import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const url = new URL(request.url);

  const fromParams = params?.id;
  const fromQuery = url.searchParams.get('id');
  const pathParts = url.pathname.split('/').filter(Boolean);
  const streamIndex = pathParts.findIndex((p) => p === 'stream');
  const fromPath = streamIndex !== -1 ? pathParts[streamIndex + 1] : undefined;
  const id = fromParams || fromQuery || fromPath;

  if (!id) {
    return NextResponse.json({ error: 'Missing file id' }, { status: 400 });
  }

  const resourceKey = url.searchParams.get('resourceKey') || url.searchParams.get('resourcekey') || undefined;

  const base = process.env.CDN_BASE || process.env.STREAM_BASE || process.env.STREAM_API_BASE;
  if (!base) {
    return NextResponse.json(
      { error: 'CDN_BASE/STREAM_BASE/STREAM_API_BASE is not configured' },
      { status: 500 },
    );
  }

  const trimmedBase = base.replace(/\/+$/, '');
  const qs = new URLSearchParams();
  if (resourceKey) qs.set('resourceKey', resourceKey);
  const target = `${trimmedBase}/drive/stream/${encodeURIComponent(id)}${qs.toString() ? `?${qs.toString()}` : ''}`;

  const res = NextResponse.redirect(target, 302);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

