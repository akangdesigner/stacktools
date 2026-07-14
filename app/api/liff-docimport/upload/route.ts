import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 客戶資料文件導入：上傳 PDF。查客戶 → 轉呼叫 n8n upload webhook
// （n8n 那邊抽取 PDF 文字、切塊、embedding，存進 Supabase「documents」向量表）。
// 標題一律用上傳檔名（去副檔名），不用 PDF 內部 metadata 的 Title（很多 PDF 沒填、會是空的），
// 這樣後續刪除時「照檔名刪」才會準。
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD = 20 * 1024 * 1024;

const N8N_UPLOAD_WEBHOOK =
  process.env.N8N_DOCIMPORT_UPLOAD_WEBHOOK ||
  'https://stack.zeabur.app/webhook/docimport-liff-upload';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const line_uid = String(formData.get('line_uid') || '').trim();
  const file = formData.get('file');

  if (!line_uid) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: '目前僅支援 PDF 格式檔案' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json({ error: `檔案 ${mb}MB 超過 20MB 上限` }, { status: 400 });
  }

  const client = getClientByLineUid(line_uid);
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }

  const title = file.name.replace(/\.pdf$/i, '');

  try {
    const upstreamForm = new FormData();
    upstreamForm.append('customer_data', JSON.stringify({ name: client.name }));
    upstreamForm.append('title', title);
    upstreamForm.append('data', file, file.name);

    const upstream = await fetch(N8N_UPLOAD_WEBHOOK, { method: 'POST', body: upstreamForm });

    if (!upstream.ok) {
      const raw = await upstream.text();
      return NextResponse.json(
        { error: `導入失敗（n8n ${upstream.status}）：${raw.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as { ok?: boolean; title?: string };
    if (!data.ok) {
      return NextResponse.json({ error: '導入回傳格式異常，請重試' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, title: data.title || title });
  } catch (err) {
    return NextResponse.json({ error: `導入連線失敗：${String(err)}` }, { status: 504 });
  }
}
