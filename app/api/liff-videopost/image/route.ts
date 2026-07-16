import { NextRequest, NextResponse } from 'next/server';

// 短影音貼文生圖：送出→輪詢，跟節慶頁同一套（避開 Cloudflare 對長請求的 504）。
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const IMAGE_MODEL = 'openai/gpt-5.4-image-2';

type Job = { status: 'pending' | 'done' | 'error'; dataUrl?: string; error?: string; ts: number };

// 模組層 job 表；Zeabur 是常駐 Node process，跨請求存活（process 重啟會清空，可接受）
const g = globalThis as unknown as { __videopostImageJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__videopostImageJobs ??= new Map());

function prune() {
  const now = Date.now();
  for (const [k, v] of jobs) if (now - v.ts > 15 * 60 * 1000) jobs.delete(k);
}

// 背景生圖：完成/失敗都寫回 job 表
async function generate(jobId: string, imagePrompt: string, adjustment?: string, baseImage?: string) {
  const apiKey = process.env.OPENROUTER_IMAGE_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    jobs.set(jobId, { status: 'error', error: '伺服器尚未設定 OPENROUTER_IMAGE_API_KEY 或 OPENROUTER_API_KEY 環境變數', ts: Date.now() });
    return;
  }

  // 定向調整且有底圖 → 走圖像編輯（img2img）：帶上一張圖進去，指令要求只改「調整」提到的地方，
  // 其餘整體構圖/畫風/顏色一律保持不變。沒底圖（首次生圖或重新生成）→ 維持純文字全新生成。
  const editing = !!(baseImage && adjustment?.trim());
  const finalPrompt = adjustment?.trim()
    ? `${imagePrompt}\n\n[Adjustment — must apply exactly, this overrides conflicting parts above]: ${adjustment.trim()}`
    : imagePrompt;
  const content = editing
    ? [
        { type: 'image_url', image_url: { url: baseImage! } },
        {
          type: 'text',
          text:
            'Edit the provided image. Preserve the overall composition, layout, framing, subject, art style, and color palette exactly — keep every element the instruction does NOT mention unchanged. Only modify precisely what the instruction asks for.\n\n' +
            `Instruction: ${adjustment!.trim()}`,
        },
      ]
    : [{ type: 'text', text: finalPrompt }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);
  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tool.dg166.com',
        'X-Title': 'Stacktools Videopost Image', // header 只能 Latin1，別放中文
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let m: string;
      try {
        m = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw;
      } catch {
        m = raw || String(upstream.status);
      }
      jobs.set(jobId, { status: 'error', error: `OpenRouter 生圖錯誤：${m}`, ts: Date.now() });
      return;
    }

    const data = (await upstream.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const dataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) {
      jobs.set(jobId, { status: 'error', error: '生圖回傳沒有圖片（模型可能抽風，請重試）', ts: Date.now() });
      return;
    }
    jobs.set(jobId, { status: 'done', dataUrl, ts: Date.now() });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    jobs.set(jobId, {
      status: 'error',
      error: aborted ? '生圖逾時（超過 285 秒），請重試' : `生圖失敗：${String(err)}`,
      ts: Date.now(),
    });
  } finally {
    clearTimeout(timer);
  }
}

// 送出生圖任務 → 立刻回 jobId
export async function POST(req: NextRequest) {
  const { imagePrompt, adjustment, baseImage } = (await req.json()) as { imagePrompt?: string; adjustment?: string; baseImage?: string };
  if (!imagePrompt || !imagePrompt.trim()) {
    return NextResponse.json({ error: '缺少 imagePrompt' }, { status: 400 });
  }
  prune();
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'pending', ts: Date.now() });
  void generate(jobId, imagePrompt, adjustment, baseImage); // 背景跑，不 await
  return NextResponse.json({ jobId });
}

// 輪詢進度
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ status: 'error', error: '找不到此生圖任務（可能已過期，請重試）' }, { status: 404 });
  }
  if (job.status === 'done') {
    jobs.delete(jobId);
    return NextResponse.json({ status: 'done', dataUrl: job.dataUrl });
  }
  if (job.status === 'error') {
    jobs.delete(jobId);
    return NextResponse.json({ status: 'error', error: job.error });
  }
  return NextResponse.json({ status: 'pending' });
}
