export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAiEditorClient } from '@/lib/aiEditorDb';

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

  const client = createAiEditorClient({
    name: body.name.trim(),
    site_url: body.siteUrl.trim(),
    social_account: body.socialAccount?.trim() ?? '',
    line_uid: body.lineUid.trim(),
    keywords: '',
    persona: '',
    client_info: '',
  });

  return NextResponse.json({ ok: true, id: client.id, action: 'created' });
}
