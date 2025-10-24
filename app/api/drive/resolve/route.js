import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function extractId(input) {
  if (!input) return null;
  try {
    // Accept raw ID
    if (/^[A-Za-z0-9_-]{20,}$/.test(input)) return input;

    const u = new URL(input);
    // Patterns:
    // https://drive.google.com/file/d/<id>/view
    // https://drive.google.com/open?id=<id>
    // https://drive.google.com/uc?id=<id>&export=download
    const pathParts = u.pathname.split('/').filter(Boolean);
    const fileIndex = pathParts.findIndex((p) => p === 'file');
    if (fileIndex !== -1 && pathParts[fileIndex + 1] === 'd' && pathParts[fileIndex + 2]) {
      return pathParts[fileIndex + 2];
    }
    const qid = u.searchParams.get('id');
    if (qid) return qid;
  } catch (_) {}
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') || searchParams.get('u') || '';
  const name = searchParams.get('name') || '';
  const id = extractId(url);
  if (!id) {
    return NextResponse.json({ error: 'Invalid Google Drive URL or ID' }, { status: 400 });
  }
  const to = `/watch/${encodeURIComponent(id)}${name ? `?name=${encodeURIComponent(name)}` : ''}`;
  return NextResponse.redirect(to, 302);
}
