import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const destinationId = body?.destinationId;
    if (!ids.length || !destinationId) {
      return NextResponse.json({ error: 'Missing ids or destinationId' }, { status: 400 });
    }
    const drive = getDrive();
    const results = [];
    for (const id of ids) {
      try {
        // Inspect mimeType
        const meta = await drive.files.get({ fileId: id, fields: 'id, name, mimeType', supportsAllDrives: true });
        if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
          results.push({ id, error: 'Folder copy is not supported' });
          continue;
        }
        const copied = await drive.files.copy({
          fileId: id,
          requestBody: { parents: [destinationId] },
          fields: 'id, name',
          supportsAllDrives: true,
        });
        results.push({ id, file: copied.data });
      } catch (e) {
        results.push({ id, error: e?.message || 'Copy failed' });
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to copy' }, { status: 500 });
  }
}
