import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';
import { Readable } from 'stream';

export const runtime = 'nodejs';

function guessNameFromUrl(u) {
  try {
    const url = new URL(u);
    const pathname = url.pathname || '';
    const last = pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last || 'download');
  } catch {
    return 'download';
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const urls = Array.isArray(body?.urls) ? body.urls : (typeof body?.url === 'string' ? [body.url] : []);
    const folderId = body?.folderId || 'root';

    if (!urls || urls.length === 0) {
      return NextResponse.json({ error: 'No urls provided' }, { status: 400 });
    }

    const drive = getDrive();

    const results = [];
    for (const u of urls) {
      const url = String(u).trim();
      if (!url) continue;
      try {
        // Try fetch HEAD to get potential filename from headers
        let filename = guessNameFromUrl(url);
        let mimeType = 'application/octet-stream';
        try {
          const head = await fetch(url, { method: 'HEAD' });
          const cd = head.headers.get('content-disposition') || '';
          const ct = head.headers.get('content-type') || '';
          if (ct) mimeType = ct;
          const m = cd.match(/filename\*=UTF-8''([^;\s]+)|filename="?([^";]+)"?/i);
          if (m) {
            filename = decodeURIComponent(m[1] || m[2] || filename);
          }
        } catch {}

        const res = await fetch(url);
        if (!res.ok || !res.body) {
          throw new Error(`Failed to download (${res.status})`);
        }

        // Convert Web ReadableStream to Node.js Readable stream for googleapis client
        const bodyStream = typeof Readable.fromWeb === 'function' ? Readable.fromWeb(res.body) : Readable.from(res.body);

        const created = await drive.files.create({
          requestBody: {
            name: filename,
            parents: [folderId],
          },
          media: {
            mimeType,
            body: bodyStream,
          },
          fields: 'id, name',
          supportsAllDrives: true,
          uploadType: 'multipart',
        });

        results.push({ url, file: created.data });
      } catch (e) {
        results.push({ url, error: e?.message || 'Upload failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Upload from link error', {
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json({ error: 'Failed to upload from link' }, { status: 500 });
  }
}
