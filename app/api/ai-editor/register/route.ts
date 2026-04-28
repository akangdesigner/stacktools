export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { upsertClientByLineUid } from '@/lib/aiEditorDb';

export async function POST(req: Request) {
  const body = await req.json() as {
    line_uid?: string;
    name?: string;
    site_url?: string;
    social_account?: string;
    keywords?: string;
    persona?: string;
    client_info?: string;
    recent_activities?: string;
  };

  if (!body.line_uid?.trim()) {
    return NextResponse.json({ error: '缺少必要欄位：line_uid' }, { status: 400 });
  }

  const skip = (v?: string) => v === undefined || v.trim() === '不更動';

  const { client, action } = upsertClientByLineUid(body.line_uid.trim(), {
    ...(!skip(body.name) && { name: body.name!.trim() }),
    ...(!skip(body.site_url) && { site_url: body.site_url!.trim() }),
    ...(!skip(body.social_account) && { social_account: body.social_account!.trim() }),
    ...(!skip(body.keywords) && { keywords: body.keywords!.trim() }),
    ...(!skip(body.persona) && { persona: body.persona!.trim() }),
    ...(!skip(body.client_info) && { client_info: body.client_info!.trim() }),
    ...(!skip(body.recent_activities) && { recent_activities: body.recent_activities!.trim() }),
  });

  return NextResponse.json({ ok: true, id: client.id, action });
}
