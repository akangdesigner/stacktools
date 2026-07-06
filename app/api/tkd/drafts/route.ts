import { NextRequest, NextResponse } from 'next/server';
import { listDrafts, getDraft, deleteDraft } from '@/lib/tkdDb';

// TKD 兩階段草稿 API
// GET            → 草稿清單（不含 pages 明細）
// GET ?id=123    → 單一草稿（含 pages 明細，給階段二載入用）
// DELETE ?id=123 → 刪除草稿（階段二做完後清掉）

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
