import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';
import { extractAudio, transcribeAudio } from '@/lib/transcribeAudio';

// 短影音轉貼文：LIFF 上傳影片 → 這裡抽音軌＋Groq 轉逐字稿（不用 n8n 的 CloudConvert）
// → 帶逐字稿轉呼叫 n8n 生文案 webhook（n8n 那邊沿用原本的 AI Agent＋RAG 知識庫寫貼文＋生圖片提示詞）
// 送出→輪詢，跟生圖那步同一套（避開 Cloudflare/Zeabur edge 對長請求的 gateway timeout）
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_UPLOAD = 200 * 1024 * 1024;

const N8N_TEXT_WEBHOOK =
  process.env.N8N_VIDEOPOST_TEXT_WEBHOOK ||
  'https://stack.zeabur.app/webhook/videopost-liff-text';

type Job = {
  status: 'pending' | 'done' | 'error';
  content?: string;
  imagePrompt?: string;
  customerName?: string;
  error?: string;
  ts: number;
};

// 模組層 job 表；Zeabur 是常駐 Node process，跨請求存活（process 重啟會清空，可接受）
const g = globalThis as unknown as { __videopostTextJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__videopostTextJobs ??= new Map());

function prune() {
  const now = Date.now();
  for (const [k, v] of jobs) if (now - v.ts > 15 * 60 * 1000) jobs.delete(k);
}

// 背景跑：抽音軌＋轉逐字稿＋呼叫 n8n 生文案，完成/失敗都寫回 job 表
async function run(jobId: string, line_uid: string, srcBuf: Buffer, ext: string) {
  const client = getClientByLineUid(line_uid);
  if (!client) {
    jobs.set(jobId, { status: 'error', error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」', ts: Date.now() });
    return;
  }

  let transcript: string;
  try {
    const audio = await extractAudio(srcBuf, ext);
    transcript = await transcribeAudio(audio);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    jobs.set(jobId, { status: 'error', error: `影片轉逐字稿失敗：${msg}`, ts: Date.now() });
    return;
  }

  const customer_data = {
    name: client.name,
    social_account: client.social_account,
    keywords: client.keywords,
    persona: client.persona,
    client_info: client.client_info,
    recent_activities: client.recent_activities,
    fb_group_url: client.fb_group_url,
    line_uid: client.line_uid,
  };

  try {
    const upstream = await fetch(N8N_TEXT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data, transcript }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      jobs.set(jobId, {
        status: 'error',
        error: `生文案失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}`,
        ts: Date.now(),
      });
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
      customerName: client.name,
      ts: Date.now(),
    });
  } catch (err) {
    jobs.set(jobId, { status: 'error', error: `生文案連線失敗：${String(err)}`, ts: Date.now() });
  }
}

// 送出：收檔案 → 立刻回 jobId，背景跑轉逐字稿＋生文案
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const line_uid = String(formData.get('line_uid') || '').trim();
  const file = formData.get('file');

  if (!line_uid) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳影片檔案' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json({ error: `檔案 ${mb}MB 超過 200MB 上限，請裁短一點再試` }, { status: 400 });
  }

  const srcBuf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  prune();
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'pending', ts: Date.now() });
  void run(jobId, line_uid, srcBuf, ext); // 背景跑，不 await
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
    return NextResponse.json({
      status: 'done',
      content: job.content,
      imagePrompt: job.imagePrompt,
      customerName: job.customerName,
    });
  }
  if (job.status === 'error') {
    jobs.delete(jobId);
    return NextResponse.json({ status: 'error', error: job.error });
  }
  return NextResponse.json({ status: 'pending' });
}
