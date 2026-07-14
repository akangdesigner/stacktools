import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 客戶資料文件導入：刪除已匯入文件。查客戶 → 轉呼叫 n8n delete webhook
// （n8n 那邊依 metadata.客戶名稱＋資料標題 從 Supabase「documents」向量表刪除對應列）。
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const N8N_DELETE_WEBHOOK =
  process.env.N8N_DOCIMPORT_DELETE_WEBHOOK ||
  'https://stack.zeabur.app/webhook/docimport-liff-delete';

export async function POST(req: NextRequest) {
  const { line_uid, title } = (await req.json()) as { line_uid?: string; title?: string };
  if (!line_uid || !line_uid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }
  if (!title || !title.trim()) {
    return NextResponse.json({ error: '缺少要刪除的文件標題' }, { status: 400 });
  }

  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json({ error: '找不到你的客戶資料' }, { status: 404 });
  }

  try {
    const upstream = await fetch(N8N_DELETE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_data: { name: client.name }, title: title.trim() }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `刪除失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return NextResponse.json({ error: `刪除連線失敗：${String(err)}` }, { status: 504 });
  }
}
