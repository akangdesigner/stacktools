import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 部落格文章改寫：LIFF 帶 line_uid 進來 → 用 uid 查客戶資料 → 轉呼叫 n8n 改寫 webhook
// （n8n 那邊抓客戶最新一篇文章、萃取內文，依品牌人設改寫成社群貼文；圖片沿用原文 OG 圖，不重新生成）
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const N8N_TEXT_WEBHOOK =
  process.env.N8N_BLOGREWRITE_TEXT_WEBHOOK ||
  'https://stack.zeabur.app/webhook/blogrewrite-liff-text';

export async function POST(req: NextRequest) {
  const { line_uid } = (await req.json()) as { line_uid?: string };
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
      body: JSON.stringify({ customer_data }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `改寫失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as {
      title?: string;
      content?: string;
      imageUrl?: string;
      sourceTitle?: string;
    };
    if (!data?.content) {
      return NextResponse.json({ error: '改寫回傳格式異常，請重試' }, { status: 502 });
    }

    return NextResponse.json({ ...data, customerName: client.name });
  } catch (err) {
    return NextResponse.json({ error: `改寫連線失敗：${String(err)}` }, { status: 504 });
  }
}
