import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { setJobResult } from '@/lib/blogGenDb';

export async function POST(req: NextRequest) {
  const { jobId, status, result } = await req.json();
  if (!jobId || !status) return NextResponse.json({ error: '缺少 jobId 或 status' }, { status: 400 });

  setJobResult(jobId, status, result ?? '');
  return NextResponse.json({ ok: true });
}
