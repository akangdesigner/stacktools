import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';
import { createJob, getJob, deleteJob, pruneJobs, failJob } from '@/lib/socialMonitorJobs';

// 社群海巡留言：n8n 掃 Threads＋FB＋逐篇評分＋生留言，實測要 5~10 分鐘。
// App 這端不等 n8n 跑完（Node fetch 內建 300 秒 headers timeout，硬等會 TypeError）：
// POST 立刻回 jobId 並把任務丟給 n8n；n8n 跑完打 /api/liff-social-monitor/callback 寫回；
// GET ?jobId 查進度。每個請求都很快、不會被切斷。
export const dynamic = 'force-dynamic';

const N8N_WEBHOOK =
  process.env.N8N_SOCIAL_MONITOR_WEBHOOK ||
  'https://stack.zeabur.app/webhook/social-monitor-liff';

// n8n 跑完要打回來的位址（Zeabur 正式網域）
const CALLBACK_URL =
  process.env.SOCIAL_MONITOR_CALLBACK_URL ||
  'https://tool.dg166.com/api/liff-social-monitor/callback';

// 把任務送給 n8n。webhook 是 onReceived 模式，會立刻回 200，不會久等。
async function dispatch(jobId: string, customer_data: Record<string, unknown>) {
  try {
    const upstream = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, callback_url: CALLBACK_URL, customer_data }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      failJob(jobId, `掃描啟動失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}`);
    }
  } catch (err) {
    failJob(jobId, `掃描連線失敗：${String(err)}`);
  }
}

// 送出掃描任務 → 立刻回 jobId
export async function POST(req: NextRequest) {
  const { line_uid, selected_keywords, sort_by, freshness } = (await req.json()) as {
    line_uid?: string;
    selected_keywords?: string[];
    sort_by?: string;
    freshness?: string;
  };
  if (!line_uid || !line_uid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }

  // 海巡排序標準：likes=讚數高 / replies=留言高 / relevant=關聯度高（決定 n8n 怎麼挑貼文）
  const sortBy = ['likes', 'replies', 'relevant'].includes(String(sort_by)) ? String(sort_by) : 'likes';

  // 抓取新鮮度：relevant=最相關（Threads sortByRecent=false）/ recent=最新（sortByRecent=true）
  const freshnessMode = String(freshness) === 'recent' ? 'recent' : 'relevant';

  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }

  const picked = Array.isArray(selected_keywords)
    ? selected_keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 3)
    : [];

  const customer_data = {
    name: client.name,
    social_account: client.social_account,
    keywords: client.keywords,
    persona: client.persona,
    client_info: client.client_info,
    recent_activities: client.recent_activities,
    fb_group_url: client.fb_group_url,
    line_uid: client.line_uid,
    selected_keywords: picked,
    sort_by: sortBy,
    freshness: freshnessMode,
  };

  pruneJobs();
  const jobId = crypto.randomUUID();
  createJob(jobId);
  void dispatch(jobId, customer_data); // 背景送出，不 await
  return NextResponse.json({ jobId });
}

// 輪詢進度
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ status: 'error', error: '找不到此掃描任務（可能已過期，請重試）' }, { status: 404 });
  }
  if (job.status === 'done') {
    deleteJob(jobId);
    return NextResponse.json({ status: 'done', items: job.items, customerName: job.customerName });
  }
  if (job.status === 'error') {
    deleteJob(jobId);
    return NextResponse.json({ status: 'error', error: job.error });
  }
  return NextResponse.json({ status: 'pending' });
}
