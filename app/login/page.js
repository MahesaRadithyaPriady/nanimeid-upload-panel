"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || data?.error || 'Login gagal');
        return;
      }
      const token = data?.token || data?.accessToken || data?.access_token;
      if (token) {
        try {
          window.localStorage.setItem('admin_token', token);
        } catch (_) {
          // abaikan error localStorage
        }
      }
      router.push('/');
    } catch (_) {
      setError('Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-black dark:text-zinc-50 flex items-center justify-center p-4">
      <main className="w-full max-w-sm">
        <div className="rounded-xl border bg-white dark:bg-zinc-900 shadow-sm p-6">
          <h1 className="text-2xl font-semibold text-center">Login</h1>
          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>
          ) : null}
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm opacity-80">Username</label>
              <input
                type="text"
                placeholder="username"
                className="w-full rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-800"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm opacity-80">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full rounded border px-3 py-2 text-sm bg-white dark:bg-zinc-800"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black disabled:opacity-50 w-full"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
