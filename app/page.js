"use client";

import { useEffect, useMemo, useState } from "react";

function bytesToSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default function Home() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const START_FOLDER = "1hm9nX8C-mvS4sKgtuvsg6cmUlZhIcQ9F";
  const [folderStack, setFolderStack] = useState([{ id: START_FOLDER, name: "Start" }]);
  const currentFolderId = folderStack[folderStack.length - 1].id;
  const [uploads, setUploads] = useState([]);
  const [query, setQuery] = useState("");
  const [pageToken, setPageToken] = useState(undefined);
  const [nextToken, setNextToken] = useState(null);
  const [prevTokens, setPrevTokens] = useState([]);
  const [order, setOrder] = useState('name_asc'); // name_asc | name_desc
  const [typeFilter, setTypeFilter] = useState('all'); // all | folder | file

  async function loadFiles(folderId, token) {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      sp.set('folderId', folderId);
      if (query) sp.set('search', query);
      if (token) sp.set('pageToken', token);
      if (order) sp.set('order', order);
      if (typeFilter) sp.set('type', typeFilter);
      const res = await fetch(`/api/drive/list?${sp.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load files");
      setFiles(data.files || []);
      setNextToken(data.nextPageToken || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles(currentFolderId, pageToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, pageToken, query, order, typeFilter]);

  async function onUpload(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const input = formEl.querySelector('input[name="file"]');
    const selected = Array.from(input.files || []);
    if (selected.length === 0) {
      setError("Pilih minimal 1 file");
      return;
    }
    if (selected.length > 10) {
      setError("Maksimum 10 file per unggahan");
      return;
    }
    setError("");
    const initial = selected.map(f => ({ name: f.name, progress: 0, status: 'uploading', error: '' }));
    setUploads(prev => [...prev, ...initial]);

    await Promise.all(selected.map((file, idx) => new Promise((resolve) => {
      const globalIndex = uploads.length + idx;
      const fd = new FormData();
      fd.set('folderId', currentFolderId);
      fd.set('file', file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/drive/upload');
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploads(u => u.map((it, i) => i === globalIndex ? { ...it, progress: pct, status: 'uploading' } : it));
        }
      };
      // bytes fully sent to our server
      xhr.upload.onload = () => {
        setUploads(u => u.map((it, i) => i === globalIndex ? { ...it, status: 'processing' } : it));
      };
      xhr.onreadystatechange = async () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploads(u => u.map((it, i) => i === globalIndex ? { ...it, progress: 100, status: 'done' } : it));
            await loadFiles(currentFolderId);
            resolve();
          } else {
            let msg = 'Upload failed';
            try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
            setUploads(u => u.map((it, i) => i === globalIndex ? { ...it, status: 'error', error: msg } : it));
            resolve();
          }
        }
      };
      xhr.send(fd);
    })));

    formEl.reset();
  }

  async function onDelete(id) {
    if (!confirm("Delete this item?")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/drive/delete?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      await loadFiles(currentFolderId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateFolder(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const name = formEl.folderName.value.trim();
    if (!name) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/drive/create-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create folder failed");
      await loadFiles(currentFolderId);
      formEl.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openFolder(f) {
    setFolderStack((prev) => [...prev, { id: f.id, name: f.name }]);
    setPageToken(undefined);
    setPrevTokens([]);
    setNextToken(null);
  }

  function goBackTo(index) {
    setFolderStack((prev) => prev.slice(0, index + 1));
  }

  const breadcrumb = useMemo(
    () => (
      <div className="text-sm text-zinc-600 dark:text-zinc-300 flex flex-wrap gap-1">
        {folderStack.map((f, idx) => (
          <span key={f.id} className="flex items-center gap-1">
            <button
              className="underline hover:no-underline"
              onClick={() => goBackTo(idx)}
            >
              {f.name}
            </button>
            {idx < folderStack.length - 1 ? <span className="opacity-70">/</span> : null}
          </span>
        ))}
      </div>
    ),
    [folderStack]
  );

  async function onCopyLink(f) {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/api/drive/stream/${encodeURIComponent(f.id)}`;
      await navigator.clipboard.writeText(url);
      setNotice('Proxy link disalin');
      setTimeout(() => setNotice(''), 2000);
    } catch (e) {
      setError('Gagal menyalin link');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-black dark:text-zinc-50">
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">Google Drive Manager</h1>
        <div className="mt-2">{breadcrumb}</div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200">{notice}</div>
        ) : null}

        <section className="mt-4">
          <form
            onSubmit={(e) => { e.preventDefault(); setPageToken(undefined); setPrevTokens([]); setNextToken(null); loadFiles(currentFolderId, undefined); }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPageToken(undefined); setPrevTokens([]); setNextToken(null); }}
              placeholder="Cari nama file..."
              className="w-full rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-900"
            />
            <select
              value={order}
              onChange={(e) => { setOrder(e.target.value); setPageToken(undefined); setPrevTokens([]); setNextToken(null); }}
              className="rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-900"
            >
              <option value="name_asc">A–Z</option>
              <option value="name_desc">Z–A</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPageToken(undefined); setPrevTokens([]); setNextToken(null); }}
              className="rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-900"
            >
              <option value="all">Semua</option>
              <option value="folder">Folder</option>
              <option value="file">File</option>
            </select>
            <button className="rounded-md border px-4 py-2 text-sm">Search</button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <form onSubmit={onUpload} className="rounded-lg border p-4">
            <h2 className="font-medium mb-2">Upload File</h2>
            <input name="file" type="file" className="block w-full text-sm" multiple />
            <button
              type="submit"
              className="mt-3 rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black disabled:opacity-50"
              disabled={loading}
            >
              Upload
            </button>
            {uploads.length > 0 ? (
              <div className="mt-4 space-y-2">
                {uploads.slice(-10).map((u, i) => (
                  <div key={`${u.name}-${i}`} className="text-sm">
                    <div className="flex justify-between"><span className="truncate max-w-[70%]">{u.name}</span><span>{u.progress}%</span></div>
                    <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded">
                      <div className="h-2 bg-blue-600 rounded" style={{ width: `${u.progress}%` }} />
                    </div>
                    {u.status !== 'error' ? (
                      <div className="mt-1 text-xs opacity-70">
                        {u.status === 'uploading' && 'Mengunggah…'}
                        {u.status === 'processing' && 'Memproses di server…'}
                        {u.status === 'done' && 'Selesai'}
                      </div>
                    ) : null}
                    {u.status === 'error' ? (
                      <div className="text-red-600 mt-1">{u.error || 'Gagal mengunggah'}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </form>

          <form onSubmit={onCreateFolder} className="rounded-lg border p-4">
            <h2 className="font-medium mb-2">Create Folder</h2>
            <input
              type="text"
              name="folderName"
              placeholder="Folder name"
              className="w-full rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="mt-3 rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black disabled:opacity-50"
              disabled={loading}
            >
              Create
            </button>
          </form>
        </section>

        <section className="mt-6">
          <div className="rounded-lg border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-left">Modified</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-4" colSpan={5}>Loading…</td></tr>
                ) : files.length === 0 ? (
                  <tr><td className="px-3 py-4" colSpan={5}>No items</td></tr>
                ) : (
                  files.map((f) => {
                    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="px-3 py-2">
                          {isFolder ? (
                            <button className="underline" onClick={() => openFolder(f)}>
                              {f.name}
                            </button>
                          ) : f.mimeType === 'video/mp4' ? (
                            <a
                              className="underline"
                              href={`/watch/${encodeURIComponent(f.id)}?name=${encodeURIComponent(f.name)}`}
                            >
                              {f.name}
                            </a>
                          ) : (
                            <a className="underline" href={f.webViewLink || '#'} target="_blank" rel="noreferrer">
                              {f.name}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2">{isFolder ? 'Folder' : (f.mimeType || 'File')}</td>
                        <td className="px-3 py-2">{isFolder ? '-' : bytesToSize(Number(f.size || 0))}</td>
                        <td className="px-3 py-2">{new Date(f.modifiedTime).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => onCopyLink(f)}
                              className="rounded-md border px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                              disabled={loading}
                            >
                              Copy link
                            </button>
                            <button
                              onClick={() => onDelete(f.id)}
                              className="rounded-md border px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                              disabled={loading}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              disabled={prevTokens.length === 0 || loading}
              onClick={() => {
                const prev = [...prevTokens];
                const token = prev.pop();
                setPrevTokens(prev);
                setPageToken(token);
              }}
            >
              Prev
            </button>
            <button
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              disabled={!nextToken || loading}
              onClick={() => {
                if (!nextToken) return;
                setPrevTokens(p => [...p, pageToken || null]);
                setPageToken(nextToken);
              }}
            >
              Next
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
