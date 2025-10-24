import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || 'root';

    const drive = getDrive();

    const q = `'${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)'
    });

    return NextResponse.json({ files: res.data.files || [] });
  } catch (err) {
    console.error('Drive list error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
    });
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}
