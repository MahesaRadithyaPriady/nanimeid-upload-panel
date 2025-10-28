import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';
import { Readable } from 'stream';

export const runtime = 'nodejs';

async function ensureFolderPath(drive, parentId, relativePath) {
  if (!relativePath) return parentId;
  const parts = String(relativePath).split('/').map(p => p.trim()).filter(Boolean);
  let currentParent = parentId;
  for (const name of parts) {
    // find existing folder with exact name under currentParent
    const res = await drive.files.list({
      q: `'${currentParent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/['\\]/g, "\\$&")}'`,
      pageSize: 1,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    let folderId = res.data.files && res.data.files[0] ? res.data.files[0].id : null;
    if (!folderId) {
      const created = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParent],
        },
        fields: 'id, name',
        supportsAllDrives: true,
      });
      folderId = created.data.id;
    }
    currentParent = folderId;
  }
  return currentParent;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const folderId = form.get('folderId') || 'root';
    const file = form.get('file');
    const relativePath = (form.get('relativePath') || '').toString();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const drive = getDrive();

    console.log('Drive upload start', {
      folderId,
      name: file.name,
      type: file.type,
      size: typeof file.size === 'number' ? file.size : undefined,
    });

    const webStream = file.stream();
    const bodyStream = typeof Readable.fromWeb === 'function' ? Readable.fromWeb(webStream) : Readable.from(webStream);

    const targetParentId = await ensureFolderPath(drive, folderId, relativePath);

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [targetParentId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: bodyStream,
      },
      fields: 'id, name',
      supportsAllDrives: true,
      uploadType: 'multipart',
    });

    return NextResponse.json({ file: res.data });
  } catch (err) {
    console.error('Drive upload error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
    });
    return NextResponse.json({ error: 'Failed to upload file', details: err?.response?.data || err?.message }, { status: 500 });
  }
}

