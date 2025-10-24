"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

export default function WatchPage() {
  const qp = useSearchParams();
  const pathname = usePathname();
  const initialId = qp.get('id') || (() => {
    const parts = (pathname || '').split('/').filter(Boolean);
    const watchIndex = parts.findIndex(p => p === 'watch');
    return watchIndex !== -1 ? (parts[watchIndex + 1] || '') : '';
  })();
  const [id, setId] = useState(initialId);
  const nameParam = qp.get('name');
  const resourceKey = qp.get('resourceKey') || qp.get('resourcekey') || '';
  const title = nameParam ? decodeURIComponent(nameParam) : (id ? `Video ${id}` : 'Missing file id');
  const src = id ? `/api/drive/stream/${encodeURIComponent(id)}${resourceKey ? `?resourceKey=${encodeURIComponent(resourceKey)}` : ''}` : '';
  const [meta, setMeta] = useState(null);
  const metaUrl = id ? `/api/drive/meta/${encodeURIComponent(id)}${resourceKey ? `?resourceKey=${encodeURIComponent(resourceKey)}` : ''}` : '';

  useEffect(() => {
    if (!id) {
      const parts = (pathname || '').split('/').filter(Boolean);
      const watchIndex = parts.findIndex(p => p === 'watch');
      const fromPath = watchIndex !== -1 ? parts[watchIndex + 1] : '';
      const fromQuery = qp.get('id') || '';
      const resolved = fromPath || fromQuery || '';
      if (resolved) setId(resolved);
    }
    // react hooks deps: update if qp or pathname changes
  }, [id, qp, pathname]);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        if (!metaUrl) return;
        const res = await fetch(metaUrl, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch metadata');
        if (!abort) setMeta(data.file);
      } catch (e) {
        if (!abort) setMeta({ error: e.message });
      }
    })();
    return () => { abort = true; };
  }, [metaUrl]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-black dark:text-zinc-50">
      <main className="mx-auto max-w-4xl p-6">
        <a href="/" className="text-sm underline">← Back</a>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        {id ? (
          <div className="mt-4">
            <div className="mb-4 rounded-md border p-3 text-sm">
              <div className="font-medium">Direct proxy URL</div>
              <div className="mt-1 break-all text-blue-600 underline">{src}</div>
              {meta ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><span className="opacity-70">Name:</span> {meta.name || '-'}</div>
                  <div><span className="opacity-70">Mime:</span> {meta.mimeType || '-'}</div>
                  <div><span className="opacity-70">Size:</span> {meta.size || '-'}</div>
                  <div><span className="opacity-70">Modified:</span> {meta.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : '-'}</div>
                </div>
              ) : (
                <div className="mt-2 opacity-70">Loading metadata…</div>
              )}
            </div>
            <video
              key={id}
              controls
              preload="metadata"
              className="w-full max-h-[70vh] bg-black"
            >
              <source src={src} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Missing file id. Open via /watch/[id] or add ?id=FILE_ID to the URL.
          </div>
        )}
      </main>
    </div>
  );
}
