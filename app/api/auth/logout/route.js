import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
  );
  response.cookies.set('admin_token', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
