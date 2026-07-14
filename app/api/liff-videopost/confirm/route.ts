import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 短影音貼文確認：LIFF 選定文案＋圖後送來 → 查客戶 → 轉呼叫 n8n confirm webhook
// （n8n 那邊複用節慶那套：上傳 Drive＋寫 Sheet，寫進「ai小編上架文章」草稿列，是否發布=否）
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const N8N_CONFIRM_WEBHOOK =
  process.env.N8N_VIDEOPOST_CONFIRM_WEBHOOK ||
  'https://stack.zeabur.app/webhook/videopost-liff-confirm';

export async function POST(req: NextRequest) {
  const { line_uid, title, content, imageDataUrl } = (await req.json()) as {
    line_uid?: string;
    title?: string;
    content?: string;
    imageDataUrl?: string;
  };

  if (!line_uid || !title || !content || !imageDataUrl) {
    return NextResponse.json(
      { error: '缺少必要欄位（line_uid / title / content / imageDataUrl）' },
      { status: 400 }
    );
  }

  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json({ error: '找不到你的客戶資料' }, { status: 404 });
  }

  const customer_data = {
    name: client.name,
    social_account: client.social_account,
    line_uid: client.line_uid,
  };

  try {
    const upstream = await fetch(N8N_CONFIRM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data, title, content, imageDataUrl }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `存檔失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return NextResponse.json({ error: `存檔連線失敗：${String(err)}` }, { status: 504 });
  }
}
