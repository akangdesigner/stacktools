import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 時事互動貼文文案：n8n 抓客戶關鍵字→Threads熱門話題→逐篇評分→依品牌人設寫貼文→生圖片提示詞，
// 實測要 3~4 分鐘，遠超 Cloudflare 對前端連線的 100 秒上限（同步等會被切、前端卡在 95%）。
// 改「送出→背景跑→前端輪詢」：POST 立刻回 jobId、背景打 n8n；GET ?jobId 查進度。
// 每個請求都很快、不會被 Cloudflare 切斷。（跟時事配圖 image、社群海巡 social-monitor 同一套模式）
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const N8N_TEXT_WEBHOOK =
  process.env.N8N_NEWS_TEXT_WEBHOOK ||
  'https://stack.zeabur.app/webhook/news-liff-text';

type Job = {
  status: 'pending' | 'done' | 'error';
  content?: string;
  imagePrompt?: string;
  customerName?: string;
  error?: string;
  ts: number;
};

// 模組層 job 表；Zeabur 是常駐 Node process，跨請求存活（process 重啟會清空，可接受）
const g = globalThis as unknown as { __newsTextJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__newsTextJobs ??= new Map());

function prune() {
  const now = Date.now();
  for (const [k, v] of jobs) if (now - v.ts > 15 * 60 * 1000) jobs.delete(k);
}

// 背景生文案：完成/失敗都寫回 job 表
async function scan(
  jobId: string,
  customer_data: Record<string, unknown>,
  fallbackName: string
) {
  try {
    const upstream = await fetch(N8N_TEXT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      jobs.set(jobId, { status: 'error', error: `生文案失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}`, ts: Date.now() });
      return;
    }

    const data = (await upstream.json()) as { content?: string; imagePrompt?: string };
    if (!data?.content || !data?.imagePrompt) {
      jobs.set(jobId, { status: 'error', error: '生文案回傳格式異常，請重試', ts: Date.now() });
      return;
    }

    jobs.set(jobId, {
      status: 'done',
      content: data.content,
      imagePrompt: data.imagePrompt,
      customerName: fallbackName,
      ts: Date.now(),
    });
  } catch (err) {
    jobs.set(jobId, { status: 'error', error: `生文案連線失敗：${String(err)}`, ts: Date.now() });
  }
}

// 送出生文案任務 → 立刻回 jobId
export async function POST(req: NextRequest) {
  const { line_uid, selected_keywords } = (await req.json()) as {
    line_uid?: string;
    selected_keywords?: string[];
  };
  if (!line_uid || !line_uid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }

  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }

  // 用戶在 LIFF 選的關鍵字（最多 3 個）；沒選就給空陣列，n8n 會 fallback 原本的隨機挑選
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
  };

  prune();
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'pending', ts: Date.now() });
  void scan(jobId, customer_data, client.name); // 背景跑，不 await
  return NextResponse.json({ jobId });
}

// 輪詢進度
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ status: 'error', error: '找不到此生文案任務（可能已過期，請重試）' }, { status: 404 });
  }
  if (job.status === 'done') {
    jobs.delete(jobId);
    return NextResponse.json({ status: 'done', content: job.content, imagePrompt: job.imagePrompt, customerName: job.customerName });
  }
  if (job.status === 'error') {
    jobs.delete(jobId);
    return NextResponse.json({ status: 'error', error: job.error });
  }
  return NextResponse.json({ status: 'pending' });
}
