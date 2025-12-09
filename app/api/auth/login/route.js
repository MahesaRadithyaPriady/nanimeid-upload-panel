import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Missing username or password' },
        { status: 400, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
      );
    }
    const base = process.env.ADMIN_API_BASE;
    try {
      // Debug: log base URL saat route dipanggil
      console.log('[auth/login] ADMIN_API_BASE =', base);
    } catch (_) {
      // ignore log errors
    }
    if (!base) {
      return NextResponse.json(
        { error: 'ADMIN_API_BASE is not configured' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
      );
    }
    const upstreamUrl = `${base.replace(/\/$/, '')}/admin/auth/login`;
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      data = {};
    }
    try {
      console.log('[auth/login] upstream response', {
        url: upstreamUrl,
        status: res.status,
        raw,
      });
    } catch (_) {
      // ignore log errors
    }
    if (!res.ok) {
      const msg = data?.message || data?.error || 'Login gagal';
      const code = data?.code || 'Error';
      return NextResponse.json(
        {
          success: false,
          code,
          message: msg,
          upstreamStatus: res.status,
          upstreamRaw: process.env.NODE_ENV !== 'production' ? raw : undefined,
        },
        { status: res.status, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
      );
    }
    const token = data?.token || data?.accessToken || data?.access_token;
    if (!token) {
      return NextResponse.json({ error: 'Missing token from auth response' }, { status: 500 });
    }
    const response = NextResponse.json(
      { success: true, code: 'OK', message: 'Login berhasil', token, admin: data?.admin ?? null },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
    );
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      { success: false, code: 'UnexpectedError', message: 'Unexpected error' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
    );
  }
}
