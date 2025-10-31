import { NextResponse } from 'next/server';
import { getDrive } from '../../../lib/drive';
import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { setProgress, clearProgress } from './_progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// Helper available at module scope
function checkBinary(binPath, args = ['-version'], timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const p = spawn(binPath, args);
      const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} resolve(false); }, timeoutMs);
      p.on('close', () => { clearTimeout(to); resolve(true); });
      p.on('error', () => { clearTimeout(to); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

async function getFfprobePath() {
  const envPath = process.env.FFPROBE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  try {
    const mod = await import('ffprobe-static');
    const p = mod?.path || mod?.default?.path || mod?.default;
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return 'ffprobe';
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

    const isVideo = (() => {
      const t = (file.type || '').toLowerCase();
      if (t.startsWith('video/')) return true;
      const n = (file.name || '').toLowerCase();
      return /\.(mp4|mkv|mov|webm|avi|m4v)$/i.test(n);
    })();

    const targetParentId = await ensureFolderPath(drive, folderId, relativePath);

    if (!isVideo) {
      const webStream = file.stream();
      const bodyStream = typeof Readable.fromWeb === 'function' ? Readable.fromWeb(webStream) : Readable.from(webStream);
      const direct = await drive.files.create({
        requestBody: { name: file.name, parents: [targetParentId] },
        media: { mimeType: file.type || 'application/octet-stream', body: bodyStream },
        fields: 'id, name',
        supportsAllDrives: true,
        uploadType: 'multipart',
      });
      return NextResponse.json(
        { files: [direct.data] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
      );
    }

    async function getFfmpegPath() {
      const envPath = process.env.FFMPEG_PATH;
      if (envPath && fs.existsSync(envPath)) return envPath;
      try {
        const mod = await import('ffmpeg-static');
        const p = mod?.default;
        if (p && fs.existsSync(p)) return p;
      } catch {}
      return 'ffmpeg';
    }

    function runFfmpeg(ffmpegPath, args, onTime) {
      return new Promise((resolve, reject) => {
        const p = spawn(ffmpegPath, args);
        let stderr = '';
        p.stderr.on('data', (d) => {
          const s = d.toString();
          stderr += s;
          if (onTime) {
            const m = s.match(/time=([0-9:.]+)/);
            if (m && m[1]) {
              const t = m[1];
              const parts = t.split(':');
              let sec = 0;
              if (parts.length === 3) {
                const [hh, mm, ss] = parts;
                sec = (parseInt(hh, 10) || 0) * 3600 + (parseInt(mm, 10) || 0) * 60 + parseFloat(ss || '0');
              } else if (parts.length === 2) {
                const [mm, ss] = parts;
                sec = (parseInt(mm, 10) || 0) * 60 + parseFloat(ss || '0');
              } else if (parts.length === 1) {
                sec = parseFloat(parts[0] || '0');
              }
              if (!Number.isNaN(sec)) onTime(sec);
            }
          }
        });
        p.on('close', (code) => {
          if (code === 0) return resolve(undefined);
          const err = new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 4000)}`);
          reject(err);
        });
        p.on('error', (e) => reject(e));
      });
    }

    function parseDurationToSec(str) {
      const m = /([0-9]{1,3}):([0-9]{1,2}):([0-9]{1,2}(?:\.[0-9]+)?)/.exec(String(str) || '');
      if (!m) return NaN;
      const hh = parseInt(m[1], 10) || 0;
      const mm = parseInt(m[2], 10) || 0;
      const ss = parseFloat(m[3] || '0');
      return hh * 3600 + mm * 60 + ss;
    }

    async function probeDurationSec(inputPath, ffmpegPath, ffprobePath) {
      // Try ffprobe first if available
      if (ffprobePath) {
        const val = await new Promise((resolve) => {
          const args = [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            inputPath,
          ];
          const p = spawn(ffprobePath, args);
          let out = '';
          p.stdout.on('data', (d) => { out += d.toString(); });
          p.on('close', () => {
            const num = parseFloat((out || '').trim());
            if (Number.isFinite(num) && num > 0) resolve(num);
            else resolve(NaN);
          });
          p.on('error', () => resolve(NaN));
        });
        if (Number.isFinite(val) && val > 0) return val;
      }
      // Fallback: parse duration from ffmpeg -i stderr
      return await new Promise((resolve) => {
        try {
          const p = spawn(ffmpegPath, ['-hide_banner', '-i', inputPath, '-f', 'null', '-']);
          let err = '';
          p.stderr.on('data', (d) => { err += d.toString(); });
          p.on('close', () => {
            const dm = /Duration:\s*([0-9:.]+)\s*,/.exec(err);
            const sec = dm ? parseDurationToSec(dm[1]) : NaN;
            resolve(Number.isFinite(sec) && sec > 0 ? sec : NaN);
          });
          p.on('error', () => resolve(NaN));
        } catch {
          resolve(NaN);
        }
      });
    }

    // Issue a job id and start background work ASAP
    const jobId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    setProgress(jobId, { status: 'preparing', current: null, done: 0, total: 4, percent: 0 });
    ;(async () => {
      const created = [];
      try {
        console.log('[UploadJob] start', { jobId, name: file.name, type: file.type, size: file.size });
        // Prepare temp paths and write uploaded file to disk first
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));
        const inputExt = path.extname(file.name || '') || '.dat';
        const inputPath = path.join(tmpDir, `input${inputExt}`);
        const webStream = file.stream();
        const nodeStream = typeof Readable.fromWeb === 'function' ? Readable.fromWeb(webStream) : Readable.from(webStream);
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(inputPath);
          nodeStream.pipe(ws);
          ws.on('finish', resolve);
          ws.on('error', reject);
          nodeStream.on('error', reject);
        });
        console.log('[UploadJob] wrote temp input', { jobId, inputPath });

        const baseName = (() => {
          const n = file.name || 'video';
          const ext = path.extname(n);
          return ext ? n.slice(0, -ext.length) : n;
        })();

        const ffmpegPath = await getFfmpegPath();
        console.log('[UploadJob] ffmpeg path', { jobId, ffmpegPath });
        const ffmpegOk = await checkBinary(ffmpegPath);
        if (!ffmpegOk) {
          console.error('[UploadJob] ffmpeg not available', { jobId, ffmpegPath });
          setProgress(jobId, { status: 'error', error: `ffmpeg not found or not executable at ${ffmpegPath}. Install system ffmpeg or set FFMPEG_PATH/.env, or install ffmpeg-static.` });
          return;
        }

        const ffprobePath = await getFfprobePath();
        console.log('[UploadJob] ffprobe path', { jobId, ffprobePath });
        const ffprobeOk = await checkBinary(ffprobePath);
        const targets = [1080, 720, 480, 360];
        const outputs = targets.map((h) => ({
          height: h,
          outPath: path.join(tmpDir, `${baseName}_${h}p.mp4`),
          outName: `${baseName}_${h}p.mp4`,
        }));

        const total = outputs.length;
        setProgress(jobId, { status: 'encoding', current: `${outputs[0].height}p`, done: 0, total, percent: 0 });
        const duration = await probeDurationSec(inputPath, ffmpegPath, ffprobeOk ? ffprobePath : null); // may be NaN
        for (let i = 0; i < outputs.length; i++) {
          const t = outputs[i];
          console.log('[UploadJob] encode start', { jobId, rendition: `${t.height}p` });
          setProgress(jobId, { status: 'encoding', current: `${t.height}p`, done: i, total, percent: Math.round((i / total) * 100) });
          const vf = `scale='-2:${t.height}:force_original_aspect_ratio=decrease',pad='iw:ih:(ow-iw)/2:(oh-ih)/2'`;
          const args = [
            '-y', '-i', inputPath,
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            t.outPath,
          ];
          let lastTime = 0;
          await runFfmpeg(ffmpegPath, args, (sec) => {
            lastTime = sec;
            if (Number.isFinite(duration) && duration > 0) {
              const frac = Math.max(0, Math.min(1, sec / duration));
              const overall = ((i + frac) / total) * 100;
              const pct = Math.max(0, Math.min(99, Math.round(overall)));
              setProgress(jobId, { status: 'encoding', current: `${t.height}p`, done: i, total, percent: pct });
              console.log('[UploadJob] percent', { jobId, rendition: `${t.height}p`, sec: Number(sec.toFixed ? sec.toFixed(1) : sec), duration: Number(duration.toFixed ? duration.toFixed(1) : duration), percent: pct });
            }
          });
          // upload this rendition
          {
            const frac = (Number.isFinite(duration) && duration > 0) ? Math.min(1, lastTime / duration) : 1;
            const pct = Math.round(((i + frac) / total) * 100);
            setProgress(jobId, { status: 'uploading', current: `${t.height}p`, done: i, total, percent: pct });
            console.log('[UploadJob] uploading start', { jobId, rendition: `${t.height}p`, percent: pct });
          }
          const stream = fs.createReadStream(t.outPath);
          const res = await drive.files.create({
            requestBody: { name: t.outName, parents: [targetParentId] },
            media: { mimeType: 'video/mp4', body: stream },
            fields: 'id, name',
            supportsAllDrives: true,
            uploadType: 'multipart',
          });
          created.push(res.data);
          const afterPct = Math.round(((i + 1) / total) * 100);
          setProgress(jobId, { status: 'progress', current: `${t.height}p`, done: i + 1, total, percent: afterPct });
          console.log('[UploadJob] rendition done', { jobId, rendition: `${t.height}p`, percent: afterPct });
        }
        setProgress(jobId, { status: 'done', done: total, total, files: created, percent: 100 });
      } catch (e) {
        setProgress(jobId, { status: 'error', error: e?.message || 'Encoding failed' });
      } finally {
        try {
          // Best-effort cleanup
        } catch {}
      }
    })();

    return NextResponse.json(
      { jobId, status: 'started' },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  } catch (err) {
    console.error('Drive upload error', {
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      errors: err?.errors,
    });
    return NextResponse.json(
      { error: 'Failed to upload file', details: err?.response?.data || err?.message },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    );
  }
}

