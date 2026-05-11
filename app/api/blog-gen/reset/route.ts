import { NextRequest, NextResponse } from 'next/server';
import { resetJob } from '@/lib/blogGenDb';

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });
  resetJob(Number(clientId));
  return NextResponse.json({ ok: true });
}
