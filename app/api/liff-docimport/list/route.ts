import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 客戶資料文件導入：查已匯入文件清單。查客戶 → 轉呼叫 n8n list webhook
// （n8n 那邊直接查 Supabase「documents」向量表，依 metadata.客戶名稱 過濾、去重資料標題）。
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const N8N_LIST_WEBHOOK =
  process.env.N8N_DOCIMPORT_LIST_WEBHOOK ||
  'https://stack.zeabur.app/webhook/docimport-liff-list';

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

  try {
    const upstream = await fetch(N8N_LIST_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data: { name: client.name } }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `查詢清單失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as { documents?: string[] };
    return NextResponse.json({ documents: data.documents || [], customerName: client.name });
  } catch (err) {
    return NextResponse.json({ error: `查詢清單連線失敗：${String(err)}` }, { status: 504 });
  }
}
