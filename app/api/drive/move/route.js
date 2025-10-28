import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        const meta = await drive.files.get({ fileId: id, fields: 'id, name, parents', supportsAllDrives: true });
        const currentParents = (meta.data.parents || []).join(',');
        const updated = await drive.files.update({
          fileId: id,
          addParents: destinationId,
          removeParents: currentParents,
          fields: 'id, name, parents',
          supportsAllDrives: true,
        });
        results.push({ id, file: updated.data });
      } catch (e) {
        results.push({ id, error: e?.message || 'Move failed' });
      }
    }
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to move' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  }
}
