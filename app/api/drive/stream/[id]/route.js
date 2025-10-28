import { NextResponse } from 'next/server';
import { getDrive, getAccessToken } from '../../../../lib/drive';
import { Readable } from 'stream';

export const runtime = 'nodejs';

export function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, Accept, Origin');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Vary', 'Origin');
  return new Response(null, { status: 204, headers });
}

export async function GET(request, { params }) {
  const url = new URL(request.url);
  const fromParams = params?.id;
  const fromQuery = url.searchParams.get('id');
  // Fallback: extract from pathname /api/drive/stream/:id
  const pathParts = url.pathname.split('/').filter(Boolean);
  const streamIndex = pathParts.findIndex(p => p === 'stream');
  const fromPath = streamIndex !== -1 ? pathParts[streamIndex + 1] : undefined;
  const id = fromParams || fromQuery || fromPath;
  console.log('[stream] url:', url.toString(), 'params:', params, 'fromParams:', fromParams, 'fromQuery:', fromQuery, 'fromPath:', fromPath, 'finalId:', id);
  const resourceKey = url.searchParams.get('resourceKey') || url.searchParams.get('resourcekey') || undefined;
  if (!id) return NextResponse.json({ error: 'Missing file id' }, { status: 400 });

  try {
    const range = request.headers.get('range') || request.headers.get('Range') || undefined;
    // Primary: Direct fetch with OAuth token (mirrors worker.js approach)
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('No access token available');

    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media${resourceKey ? `&resourceKey=${encodeURIComponent(resourceKey)}` : ''}`;
    const res = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(range ? { Range: range } : {}),
      },
      // Tie upstream to client abort to prevent dangling streams and memory usage
      signal: request.signal,
    });

    if (!res.ok && res.status !== 206) {
      // Fallback: try googleapis SDK stream (sometimes helps with headers)
      try {
        const drive = getDrive();
        const driveRes = await drive.files.get(
          { fileId: id, alt: 'media', supportsAllDrives: true, resourceKey },
          { responseType: 'stream', headers: range ? { Range: range } : {} }
        );

        const headers = new Headers();
        const srcHeaders = driveRes.headers || {};
        if (srcHeaders['content-type']) headers.set('Content-Type', srcHeaders['content-type']);
        else headers.set('Content-Type', 'video/mp4');
        if (srcHeaders['content-length']) headers.set('Content-Length', srcHeaders['content-length']);
        if (srcHeaders['accept-ranges']) headers.set('Accept-Ranges', srcHeaders['accept-ranges']);
        if (srcHeaders['content-range']) headers.set('Content-Range', srcHeaders['content-range']);
        if (srcHeaders['etag']) headers.set('ETag', srcHeaders['etag']);
        if (srcHeaders['last-modified']) headers.set('Last-Modified', srcHeaders['last-modified']);
        headers.set('Vary', 'Range');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Range, Accept, Origin');
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        const status = range ? 206 : 200;
        const nodeStream = driveRes.data;
        // Wrap Node stream into a Web ReadableStream to support proper cancel/backpressure
        const webStream = new ReadableStream({
          start(controller) {
            nodeStream.on('data', (chunk) => controller.enqueue(chunk));
            nodeStream.on('end', () => controller.close());
            nodeStream.on('error', (err) => controller.error(err));
          },
          cancel() {
            // Client disconnected: destroy upstream to free memory
            nodeStream.destroy();
          },
        });
        return new Response(webStream, { status, headers });
      } catch (sdkErr) {
        console.error('Drive stream fallback SDK error', {
          id,
          range,
          message: sdkErr?.message,
          stack: sdkErr?.stack,
          response: sdkErr?.response?.data,
          headers: sdkErr?.response?.headers,
        });
        // If SDK also failed, return original response details if present
        const text = await res.text().catch(() => '');
        return NextResponse.json({ error: 'Failed to stream file', status: res.status, details: text?.slice(0, 500) }, { status: res.status || 500 });
      }
    }

    // Success via direct fetch
    const headers = new Headers();
    const srcType = res.headers.get('content-type');
    const srcLen = res.headers.get('content-length');
    const srcAccept = res.headers.get('accept-ranges');
    const srcRange = res.headers.get('content-range');
    const srcEtag = res.headers.get('etag');
    const srcLM = res.headers.get('last-modified');
    headers.set('Content-Type', srcType || 'video/mp4');
    if (srcLen) headers.set('Content-Length', srcLen);
    if (srcAccept) headers.set('Accept-Ranges', srcAccept);
    if (srcRange) headers.set('Content-Range', srcRange);
    if (srcEtag) headers.set('ETag', srcEtag);
    if (srcLM) headers.set('Last-Modified', srcLM);
    headers.set('Vary', 'Range');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Accept, Origin');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    const status = range || srcRange ? 206 : 200;
    return new Response(res.body, { status, headers });
  } catch (err) {
    console.error('Drive stream error', {
      id,
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      headers: err?.response?.headers,
      code: err?.code,
    });
    return NextResponse.json({ error: 'Failed to stream file' }, { status: 500 });
  }
}

