import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const drive = getDrive();
    await drive.files.delete({ fileId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Drive delete error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
    });
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
