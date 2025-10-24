import { NextResponse } from 'next/server';
import { getDrive } from '../../../../lib/drive';

export const runtime = 'nodejs';

export async function GET(request, context) {
  const url = new URL(request.url);
  const maybeParams = context?.params;
  const resolvedParams = typeof maybeParams?.then === 'function' ? await maybeParams : maybeParams;
  const fromParams = resolvedParams?.id;
  const fromQuery = url.searchParams.get('id');
  const id = fromParams || fromQuery;
  const resourceKey = url.searchParams.get('resourceKey') || url.searchParams.get('resourcekey') || undefined;
  if (!id) return NextResponse.json({ error: 'Missing file id' }, { status: 400 });
  try {
    const drive = getDrive();
    const res = await drive.files.get({
      fileId: id,
      supportsAllDrives: true,
      resourceKey,
      fields: 'id, name, mimeType, size, modifiedTime, fileExtension, iconLink, thumbnailLink, webViewLink, driveId',
    });
    return NextResponse.json({ file: res.data });
  } catch (err) {
    console.error('Drive meta error', {
      id,
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      headers: err?.response?.headers,
    });
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}
