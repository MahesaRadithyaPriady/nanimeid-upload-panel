import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const id = body?.id;
    const name = (body?.name || '').toString().trim();
    if (!id || !name) {
      return NextResponse.json({ error: 'Missing id or name' }, { status: 400 });
    }
    const drive = getDrive();
    const res = await drive.files.update({
      fileId: id,
      requestBody: { name },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    return NextResponse.json({ file: res.data });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Failed to rename' }, { status: 500 });
  }
}
