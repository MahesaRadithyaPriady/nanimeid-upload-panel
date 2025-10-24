import { NextResponse } from 'next/server';
import { getAccessToken } from '../../../../lib/drive';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, mimeType = 'application/octet-stream', size, parentId = 'root' } = body || {};
    if (!name || typeof size !== 'number') {
      return NextResponse.json({ error: 'Missing required fields: name, size' }, { status: 400 });
    }

    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Auth token unavailable' }, { status: 500 });
    }

    const metadata = {
      name,
      parents: [parentId],
    };

    const endpoint = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        ...(typeof size === 'number' ? { 'X-Upload-Content-Length': String(size) } : {}),
      },
      body: JSON.stringify(metadata),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: 'Failed to start resumable upload', details: text?.slice(0, 500) }, { status: res.status || 500 });
    }

    const sessionUrl = res.headers.get('location');
    if (!sessionUrl) {
      return NextResponse.json({ error: 'Missing upload session URL' }, { status: 500 });
    }

    return NextResponse.json({ sessionUrl });
  } catch (err) {
    console.error('Upload start error', {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json({ error: 'Failed to start upload' }, { status: 500 });
  }
}
