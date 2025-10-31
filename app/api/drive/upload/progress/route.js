import { NextResponse } from 'next/server';
import { getProgress } from '../_progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const prog = getProgress(id);
  if (!prog) return NextResponse.json({ status: 'unknown' }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(prog, { headers: { 'Cache-Control': 'no-store' } });
}
