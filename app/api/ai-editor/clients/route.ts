export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listAiEditorClients,
  createAiEditorClient,
  updateAiEditorClient,
  deleteAiEditorClient,
} from '@/lib/aiEditorDb';

export async function GET() {
  return NextResponse.json(listAiEditorClients());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; site_url?: string; social_account?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string };
  const client = createAiEditorClient({
    name: body.name?.trim() ?? '',
    site_url: body.site_url?.trim() ?? '',
    social_account: body.social_account?.trim() ?? '',
    line_uid: body.line_uid?.trim() ?? '',
    keywords: body.keywords?.trim() ?? '',
    persona: body.persona?.trim() ?? '',
    client_info: body.client_info?.trim() ?? '',
    recent_activities: body.recent_activities?.trim() ?? '',
  });
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as { id?: number; name?: string; site_url?: string; social_account?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  updateAiEditorClient(body.id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.site_url !== undefined && { site_url: body.site_url }),
    ...(body.social_account !== undefined && { social_account: body.social_account }),
    ...(body.line_uid !== undefined && { line_uid: body.line_uid }),
    ...(body.keywords !== undefined && { keywords: body.keywords }),
    ...(body.persona !== undefined && { persona: body.persona }),
    ...(body.client_info !== undefined && { client_info: body.client_info }),
    ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities }),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json() as { id?: number };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteAiEditorClient(body.id);
  return NextResponse.json({ ok: true });
}
