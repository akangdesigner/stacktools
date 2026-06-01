import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getClient } from '@/lib/blogGenDb';

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getClient(Number(clientId));
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  return NextResponse.json({
    job_id: client.job_id,
    job_status: client.job_status,
    job_result: client.job_result,
    job_updated: client.job_updated,
  });
}
