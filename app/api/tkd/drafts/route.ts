import { NextRequest, NextResponse } from 'next/server';
import { listDrafts, getDraft, deleteDraft, createDraft, type DraftPage } from '@/lib/tkdDb';

// TKD 兩階段草稿 API
// GET            → 草稿清單（不含 pages 明細）
// GET ?id=123    → 單一草稿（含 pages 明細，給階段二載入用）
// POST           → 建立草稿（使用者按「儲存草稿」時呼叫）
// DELETE ?id=123 → 刪除草稿（階段二做完後清掉）

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteUrl?: string;
      sheetUrl?: string;
      scope?: 'important' | 'all';
      pages?: DraftPage[];
    };
    const siteUrl = body.siteUrl?.trim();
    const sheetUrl = body.sheetUrl?.trim();
    const pages = Array.isArray(body.pages) ? body.pages : [];
    if (!siteUrl || !sheetUrl) return NextResponse.json({ error: '缺少網址或登記表' }, { status: 400 });
    if (pages.length === 0) return NextResponse.json({ error: '沒有可存的頁面' }, { status: 400 });

    const host = (() => {
      try { return new URL(siteUrl).host; } catch { return siteUrl; }
    })();
    const id = createDraft({
      name: `${host}（${pages.length} 頁）`,
      siteUrl,
      sheetUrl,
      scope: body.scope === 'all' ? 'all' : 'important',
      pages: pages.map((p) => ({ url: p.url, label: p.label, type: p.type })),
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  if (idParam) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return NextResponse.json({ error: '草稿 id 不正確' }, { status: 400 });
    const draft = getDraft(id);
    if (!draft) return NextResponse.json({ error: '找不到這個草稿（可能已刪除）' }, { status: 404 });
    return NextResponse.json({ ok: true, draft });
  }
  return NextResponse.json({ ok: true, drafts: listDrafts() });
}

export async function DELETE(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!Number.isInteger(id)) return NextResponse.json({ error: '草稿 id 不正確' }, { status: 400 });
  const removed = deleteDraft(id);
  if (!removed) return NextResponse.json({ error: '找不到這個草稿' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
