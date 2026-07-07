import { NextRequest, NextResponse } from 'next/server';
import { listDrafts, getDraft, deleteDraft, createDraft, type DraftCheck } from '@/lib/site-audit-db';

// 網站技術健檢：兩階段草稿 API
// GET            → 草稿清單（不含階段一明細）
// GET ?id=123    → 單一草稿（含階段一明細，給階段二續做用）
// POST           → 建立草稿（使用者做完階段一按「儲存草稿」時呼叫）
// DELETE ?id=123 → 刪除草稿（階段二做完後清掉）

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string;
      sheetUrl?: string;
      stage1Checks?: DraftCheck[];
    };
    const url = body.url?.trim();
    const sheetUrl = body.sheetUrl?.trim() ?? '';
    const stage1Checks = Array.isArray(body.stage1Checks) ? body.stage1Checks : [];
    if (!url) return NextResponse.json({ error: '缺少健檢網址' }, { status: 400 });
    if (stage1Checks.length === 0) return NextResponse.json({ error: '沒有可存的階段一結果' }, { status: 400 });

    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    const id = createDraft({
      name: `${host}（階段一 ${stage1Checks.length} 項）`,
      url,
      sheetUrl,
      stage1Checks,
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
