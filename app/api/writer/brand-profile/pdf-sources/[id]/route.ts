import { NextRequest, NextResponse } from 'next/server';
import { deleteBrandPdfSource } from '@/lib/writerDb';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  deleteBrandPdfSource(Number(clientId), Number(id));
  return NextResponse.json({ ok: true });
}
