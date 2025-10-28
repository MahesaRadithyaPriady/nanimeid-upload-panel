import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || 'root';
    const search = searchParams.get('search') || '';
    let pageToken = searchParams.get('pageToken') || undefined;
    const pageSize = Number(searchParams.get('pageSize') || 50);
    const order = (searchParams.get('order') || 'name_asc').toLowerCase(); // name_asc | name_desc
    const type = (searchParams.get('type') || 'all').toLowerCase(); // all | folder | file

    const drive = getDrive();

    let q = `'${folderId}' in parents and trashed = false`;
    if (search) {
      // name contains is case-insensitive per Drive API (ASCII)
      const escaped = search.replace(/['\\]/g, '\\$&');
      q += ` and name contains '${escaped}'`;
    }
    if (type === 'folder') {
      q += ` and mimeType = 'application/vnd.google-apps.folder'`;
    } else if (type === 'file') {
      q += ` and mimeType != 'application/vnd.google-apps.folder'`;
    }

    const orderBy = order === 'name_desc' ? 'folder desc, name desc' : 'folder, name';

    // If search query is present, ignore incoming pageToken to avoid invalid token across queries
    if (search) pageToken = undefined;

    async function listWithToken(token) {
      return drive.files.list({
        q,
        pageSize: Math.min(Math.max(pageSize, 1), 100),
        pageToken: token,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink, capabilities(canTrash, canDelete))',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
        orderBy,
      });
    }

    let res;
    try {
      res = await listWithToken(pageToken);
    } catch (e) {
      if (pageToken) {
        // Retry without token if token became invalid due to changed query/filter
        res = await listWithToken(undefined);
      } else {
        throw e;
      }
    }

    return NextResponse.json(
      { files: res.data.files || [], nextPageToken: res.data.nextPageToken || null },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  } catch (err) {
    console.error('Drive list error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
      code: err?.code,
    });
    const details = err?.response?.data || err?.errors || err?.message;
    return NextResponse.json(
      { error: 'Failed to list files', details },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  }
}
