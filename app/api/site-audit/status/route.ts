import { NextRequest, NextResponse } from 'next/server';
import { getAuditJob } from '@/lib/site-audit-jobs';

// 網站技術健檢：背景 job 狀態輪詢
// GET ?id=sa_xxx → { status, message, progress, stage, url, checks?（完成才有）, error? }
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 job id' }, { status: 400 });

  const job = getAuditJob(id);
  if (!job) return NextResponse.json({ error: '找不到這個健檢工作（可能已過期，請重新健檢）' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: job.status,
    message: job.message,
    progress: job.progress,
    stage: job.stage,
    url: job.url,
    checks: job.status === 'completed' ? job.result : undefined,
    error: job.error,
  });
}
