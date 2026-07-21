import { NextRequest, NextResponse } from 'next/server';
import { finishJob, failJob } from '@/lib/socialMonitorJobs';

// n8n「AI小編-社群海巡-LIFF」掃完後打這支寫回結果，前端輪詢 generate 的 GET 拿到。
// body: { jobId, items, customerName }，失敗時 { jobId, error }
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    jobId?: string;
    items?: unknown[];
    customerName?: string;
    error?: string;
  };

  const jobId = String(body.jobId || '').trim();
  if (!jobId) return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });

  if (body.error) {
    const ok = failJob(jobId, String(body.error).slice(0, 500));
    if (!ok) return NextResponse.json({ error: '找不到此掃描任務' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const ok = finishJob(jobId, items, String(body.customerName || ''));
  // 找不到 job＝前端早就逾時放棄了，回 404 讓 n8n 執行紀錄看得出來
  if (!ok) return NextResponse.json({ error: '找不到此掃描任務（可能已逾時）' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
