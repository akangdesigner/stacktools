import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 短影音貼文確認：LIFF 選定文案＋圖後送來 → 查客戶 → 轉呼叫 n8n confirm webhook
// （n8n 那邊：上傳 Drive＋寫 Sheet 後，直接呼叫「AI小編-發文」子流程發到勾選的平台，不再回 LINE 按確認）
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const N8N_CONFIRM_WEBHOOK =
  process.env.N8N_VIDEOPOST_CONFIRM_WEBHOOK ||
  'https://stack.zeabur.app/webhook/videopost-liff-confirm';

export async function POST(req: NextRequest) {
  const { line_uid, content, imageDataUrl, platforms } = (await req.json()) as {
    line_uid?: string;
    content?: string;
    imageDataUrl?: string;
    platforms?: string; // 這次要發的平台，如 "ig,fb,threads"；沒帶就全發（相容舊版）
  };

  if (!line_uid || !content || !imageDataUrl) {
    return NextResponse.json(
      { error: '缺少必要欄位（line_uid / content / imageDataUrl）' },
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
    // 發文用 token（LIFF 直接發，不再回 LINE）：對應「AI小編-發文」流程需要的欄位名
    access_token: client.meta_access_token, // FB 粉專／FB 綁 IG 用的 Meta token
    fb_id: client.fb_page_id, // FB 粉專 ID
    threads_access_token: client.threads_access_token,
    ig_access_token: client.ig_access_token, // 無 FB 客戶的 IG 專用 token
    platforms: platforms && platforms.trim() ? platforms.trim() : 'ig,fb,threads', // 這次要發的平台
  };

  try {
    const upstream = await fetch(N8N_CONFIRM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data, content, imageDataUrl }),
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
