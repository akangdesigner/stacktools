export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listAiEditorClients,
  createAiEditorClient,
  updateAiEditorClient,
  deleteAiEditorClient,
  upsertClientByLineUid,
} from '@/lib/aiEditorDb';

export async function GET() {
  return NextResponse.json(listAiEditorClients());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; social_account?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string; buffer_ig?: string; buffer_thread?: string; buffer_fb?: string };
  const lineUid = body.line_uid?.trim() ?? '';
  if (lineUid) {
    const { client, action } = upsertClientByLineUid(lineUid, {
      ...(body.name !== undefined && { name: body.name!.trim() }),
      ...(body.social_account !== undefined && { social_account: body.social_account!.trim() }),
      ...(body.keywords !== undefined && { keywords: body.keywords!.trim() }),
      ...(body.persona !== undefined && { persona: body.persona!.trim() }),
      ...(body.client_info !== undefined && { client_info: body.client_info!.trim() }),
      ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities!.trim() }),
      ...(body.buffer_ig !== undefined && { buffer_ig: body.buffer_ig!.trim() }),
      ...(body.buffer_thread !== undefined && { buffer_thread: body.buffer_thread!.trim() }),
      ...(body.buffer_fb !== undefined && { buffer_fb: body.buffer_fb!.trim() }),
    });
    return NextResponse.json({ ...client, action });
  }
  const client = createAiEditorClient({
    name: body.name?.trim() ?? '',
    social_account: body.social_account?.trim() ?? '',
    line_uid: '',
    keywords: body.keywords?.trim() ?? '',
    persona: body.persona?.trim() ?? '',
    client_info: body.client_info?.trim() ?? '',
    recent_activities: body.recent_activities?.trim() ?? '',
    buffer_ig: body.buffer_ig?.trim() ?? '',
    buffer_thread: body.buffer_thread?.trim() ?? '',
    buffer_fb: body.buffer_fb?.trim() ?? '',
  });
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as { id?: number; name?: string; social_account?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string; buffer_ig?: string; buffer_thread?: string; buffer_fb?: string };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  updateAiEditorClient(body.id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.social_account !== undefined && { social_account: body.social_account }),
    ...(body.line_uid !== undefined && { line_uid: body.line_uid }),
    ...(body.keywords !== undefined && { keywords: body.keywords }),
    ...(body.persona !== undefined && { persona: body.persona }),
    ...(body.client_info !== undefined && { client_info: body.client_info }),
    ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities }),
    ...(body.buffer_ig !== undefined && { buffer_ig: body.buffer_ig }),
    ...(body.buffer_thread !== undefined && { buffer_thread: body.buffer_thread }),
    ...(body.buffer_fb !== undefined && { buffer_fb: body.buffer_fb }),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json() as { id?: number };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteAiEditorClient(body.id);
  return NextResponse.json({ ok: true });
}
