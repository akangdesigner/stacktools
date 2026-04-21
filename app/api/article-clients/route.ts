import { NextRequest, NextResponse } from 'next/server';
import { listArticleClients, upsertArticleClient } from '@/lib/articleClientsDb';
import type { ClientProfile } from '@/types';

export async function GET() {
  return NextResponse.json(listArticleClients());
}

export async function POST(req: NextRequest) {
  const profile = await req.json() as ClientProfile;
  if (!profile?.id || !profile?.name) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
  }
  upsertArticleClient(profile);
  return NextResponse.json({ ok: true });
}
