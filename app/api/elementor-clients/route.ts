import { NextRequest, NextResponse } from 'next/server';
import { listElementorClients, upsertElementorClient, type ElementorClientProfile } from '@/lib/elementorClientsDb';

export async function GET() {
  return NextResponse.json(listElementorClients());
}

export async function POST(req: NextRequest) {
  const profile = await req.json() as ElementorClientProfile;
  if (!profile?.id || !profile?.name) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
  }
  upsertElementorClient(profile);
  return NextResponse.json({ ok: true });
}
