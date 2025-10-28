import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    if (!id) return NextResponse.json(
      { error: 'Missing id' },
      { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );

    const drive = getDrive();
    if (permanent) {
      try {
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
      } catch (err) {
        if (err?.code === 403) {
          // Fallback to trash if permanent delete is forbidden
          await drive.files.update({ fileId: id, supportsAllDrives: true, requestBody: { trashed: true } });
        } else {
          throw err;
        }
      }
    } else {
      // Soft delete (move to trash) by default
      await drive.files.update({ fileId: id, supportsAllDrives: true, requestBody: { trashed: true } });
    }
    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  } catch (err) {
    console.error('Drive delete error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
    });
    const status = Number.isInteger(err?.code) ? err.code : 500;
    const msg = err?.errors?.[0]?.message || 'Failed to delete file';
    return NextResponse.json(
      { error: msg },
      { status, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  }
}
