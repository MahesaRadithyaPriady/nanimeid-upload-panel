import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';
import { Readable } from 'stream';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const form = await request.formData();
    const folderId = form.get('folderId') || 'root';
    const file = form.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const drive = getDrive();

    console.log('Drive upload start', {
      folderId,
      name: file.name,
      type: file.type,
      size: buffer.length,
    });

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: Readable.from(buffer),
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
