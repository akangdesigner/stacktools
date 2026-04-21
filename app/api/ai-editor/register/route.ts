import { NextResponse } from 'next/server';
import { upsertClientByLineUid } from '@/lib/aiEditorDb';

export async function POST(req: Request) {
  const body = await req.json() as {
    lineUid?: string;
    name?: string;
    siteUrl?: string;
    socialAccount?: string;
  };

  if (!body.lineUid?.trim() || !body.name?.trim() || !body.siteUrl?.trim()) {
    return NextResponse.json({ error: '缺少必要欄位：lineUid、name、siteUrl' }, { status: 400 });
  }

  const { client, action } = upsertClientByLineUid(
    body.lineUid.trim(),
    body.name.trim(),
    body.siteUrl.trim(),
    body.socialAccount?.trim() ?? ''
  );

  return NextResponse.json({ ok: true, id: client.id, action });
}
