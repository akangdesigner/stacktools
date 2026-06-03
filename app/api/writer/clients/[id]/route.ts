import { NextRequest, NextResponse } from 'next/server';
import { deleteClient, updateClient } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteClient(Number(id));
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { name?: string; progressSheetId?: string; progressSheetTab?: string };
  const { name, progressSheetId, progressSheetTab = '' } = body;
  if (!name || !progressSheetId) {
    return NextResponse.json({ error: '請填入客戶名稱與 Sheet ID' }, { status: 400 });
  }
  updateClient(Number(id), name.trim(), progressSheetId.trim(), progressSheetTab.trim());
  return NextResponse.json({ ok: true });
}
