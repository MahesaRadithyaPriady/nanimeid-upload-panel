import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
    }
    const base = process.env.ADMIN_API_BASE;
    if (!base) {
      return NextResponse.json({ error: 'ADMIN_API_BASE is not configured' }, { status: 500 });
    }
    const res = await fetch(`${base.replace(/\/$/, '')}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || 'Login failed';
      return NextResponse.json({ error: msg }, { status: res.status });
    }
    const token = data?.token || data?.accessToken || data?.access_token;
    if (!token) {
      return NextResponse.json({ error: 'Missing token from auth response' }, { status: 500 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (e) {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
