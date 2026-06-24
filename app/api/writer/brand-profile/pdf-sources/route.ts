import { NextRequest, NextResponse } from 'next/server';
import { listBrandPdfSources, addBrandPdfSource } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  return NextResponse.json(listBrandPdfSources(Number(clientId)));
}

export async function POST(req: NextRequest) {
  const { gsc_client_id, title, brand_description, writing_rules, banned_words } = await req.json();
  if (!gsc_client_id) return NextResponse.json({ error: 'gsc_client_id required' }, { status: 400 });
  const source = addBrandPdfSource(Number(gsc_client_id), title ?? '', brand_description ?? '', writing_rules ?? '', banned_words ?? '');
  return NextResponse.json(source);
}
