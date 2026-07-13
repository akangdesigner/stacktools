import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 社群海巡留言：LIFF 帶 line_uid 進來 → 用 uid 查客戶資料 → 轉呼叫 n8n 掃描 webhook
// （n8n 那邊同時掃 Threads 關鍵字＋FB 社團熱門貼文，各篩前 5 篇並生成建議留言，回傳清單）
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Threads+FB 雙路掃描＋評分，較久

const N8N_WEBHOOK =
  process.env.N8N_SOCIAL_MONITOR_WEBHOOK ||
  'https://stack.zeabur.app/webhook/social-monitor-liff';

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
    const upstream = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `掃描失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as {
      items?: unknown[];
      customerName?: string;
    };

    return NextResponse.json({ items: data.items || [], customerName: data.customerName || client.name });
  } catch (err) {
    return NextResponse.json({ error: `掃描連線失敗：${String(err)}` }, { status: 504 });
  }
}
