import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';
import { extractAudio, transcribeAudio } from '@/lib/transcribeAudio';

// 短影音轉貼文：LIFF 上傳影片 → 這裡抽音軌＋Groq 轉逐字稿（不用 n8n 的 CloudConvert）
// → 帶逐字稿轉呼叫 n8n 生文案 webhook（n8n 那邊沿用原本的 AI Agent＋RAG 知識庫寫貼文＋生圖片提示詞）
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_UPLOAD = 200 * 1024 * 1024;

const N8N_TEXT_WEBHOOK =
  process.env.N8N_VIDEOPOST_TEXT_WEBHOOK ||
  'https://stack.zeabur.app/webhook/videopost-liff-text';

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

  const client = getClientByLineUid(line_uid);
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }

  // 抽音軌＋轉逐字稿
  let transcript: string;
  try {
    const srcBuf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const audio = await extractAudio(srcBuf, ext);
    transcript = await transcribeAudio(audio);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `影片轉逐字稿失敗：${msg}` }, { status: 502 });
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
      return NextResponse.json(
        { error: `生文案失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as {
      title?: string;
      content?: string;
      imagePrompt?: string;
    };
    if (!data?.content || !data?.imagePrompt) {
      return NextResponse.json({ error: '生文案回傳格式異常，請重試' }, { status: 502 });
    }

    return NextResponse.json({ ...data, customerName: client.name });
  } catch (err) {
    return NextResponse.json({ error: `生文案連線失敗：${String(err)}` }, { status: 504 });
  }
}
