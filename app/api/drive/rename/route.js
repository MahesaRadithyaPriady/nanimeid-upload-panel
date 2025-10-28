import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const id = body?.id;
    const name = (body?.name || '').toString().trim();
    if (!id || !name) {
      return NextResponse.json(
        { error: 'Missing id or name' },
        { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
      );
    }
    const drive = getDrive();
    const res = await drive.files.update({
      fileId: id,
      requestBody: { name },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    return NextResponse.json(
      { file: res.data },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to rename' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  }
}
