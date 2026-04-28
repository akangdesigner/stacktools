export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { upsertClientByLineUid } from '@/lib/aiEditorDb';

export async function POST(req: Request) {
  const body = await req.json() as {
    lineUid?: string;
    name?: string;
    siteUrl?: string;
    socialAccount?: string;
    keywords?: string;
    persona?: string;
    client_info?: string;
    recent_activities?: string;
  };

  if (!body.lineUid?.trim()) {
    return NextResponse.json({ error: '缺少必要欄位：lineUid' }, { status: 400 });
  }

  const { client, action } = upsertClientByLineUid(body.lineUid.trim(), {
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.siteUrl !== undefined && { site_url: body.siteUrl.trim() }),
    ...(body.socialAccount !== undefined && { social_account: body.socialAccount.trim() }),
    ...(body.keywords !== undefined && { keywords: body.keywords.trim() }),
    ...(body.persona !== undefined && { persona: body.persona.trim() }),
    ...(body.client_info !== undefined && { client_info: body.client_info.trim() }),
    ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities.trim() }),
  });

  return NextResponse.json({ ok: true, id: client.id, action });
}
