import { NextRequest, NextResponse } from 'next/server';
import { deleteBrandPdfSource, updateLegacyBrandSource } from '@/lib/writerDb';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  deleteBrandPdfSource(Number(clientId), Number(id));
  return NextResponse.json({ ok: true });
}

// 只有「舊版資料」(id=0) 支援編輯；其他來源（PDF 辨識或手動新增）只能新增/刪除，不開放編輯
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== '0') return NextResponse.json({ error: '只有舊版資料（id=0）支援編輯' }, { status: 400 });
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  const { brand_description, writing_rules, banned_words } = await req.json();
  updateLegacyBrandSource(Number(clientId), brand_description ?? '', writing_rules ?? '', banned_words ?? '');
  return NextResponse.json({ ok: true });
}
