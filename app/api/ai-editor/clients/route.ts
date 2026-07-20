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
  const body = await req.json() as { name?: string; social_account?: string; fb_user?: string; fb_pass?: string; th_user?: string; th_pass?: string; ig_user?: string; ig_pass?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string; fb_group_url?: string; fb_page_id?: string; meta_access_token?: string; threads_access_token?: string; image_style?: string };
  const lineUid = body.line_uid?.trim() ?? '';
  if (lineUid) {
    const { client, action } = upsertClientByLineUid(lineUid, {
      ...(body.name !== undefined && { name: body.name!.trim() }),
      ...(body.social_account !== undefined && { social_account: body.social_account!.trim() }),
      ...(body.fb_user !== undefined && { fb_user: body.fb_user!.trim() }),
      ...(body.fb_pass !== undefined && { fb_pass: body.fb_pass!.trim() }),
      ...(body.th_user !== undefined && { th_user: body.th_user!.trim() }),
      ...(body.th_pass !== undefined && { th_pass: body.th_pass!.trim() }),
      ...(body.ig_user !== undefined && { ig_user: body.ig_user!.trim() }),
      ...(body.ig_pass !== undefined && { ig_pass: body.ig_pass!.trim() }),
      ...(body.keywords !== undefined && { keywords: body.keywords!.trim() }),
      ...(body.persona !== undefined && { persona: body.persona!.trim() }),
      ...(body.client_info !== undefined && { client_info: body.client_info!.trim() }),
      ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities!.trim() }),
      ...(body.fb_group_url !== undefined && { fb_group_url: body.fb_group_url!.trim() }),
      ...(body.fb_page_id !== undefined && { fb_page_id: body.fb_page_id!.trim() }),
      ...(body.meta_access_token !== undefined && { meta_access_token: body.meta_access_token!.trim() }),
      ...(body.threads_access_token !== undefined && { threads_access_token: body.threads_access_token!.trim() }),
      ...(body.image_style !== undefined && { image_style: body.image_style!.trim() }),
    });
    return NextResponse.json({ ...client, action });
  }
  const client = createAiEditorClient({
    name: body.name?.trim() ?? '',
    social_account: body.social_account?.trim() ?? '',
    fb_user: body.fb_user?.trim() ?? '',
    fb_pass: body.fb_pass?.trim() ?? '',
    th_user: body.th_user?.trim() ?? '',
    th_pass: body.th_pass?.trim() ?? '',
    ig_user: body.ig_user?.trim() ?? '',
    ig_pass: body.ig_pass?.trim() ?? '',
    line_uid: '',
    keywords: body.keywords?.trim() ?? '',
    persona: body.persona?.trim() ?? '',
    client_info: body.client_info?.trim() ?? '',
    recent_activities: body.recent_activities?.trim() ?? '',
    fb_group_url: body.fb_group_url?.trim() ?? '',
    fb_page_id: body.fb_page_id?.trim() ?? '',
    meta_access_token: body.meta_access_token?.trim() ?? '',
    threads_access_token: body.threads_access_token?.trim() ?? '',
    image_style: body.image_style?.trim() ?? '',
  });
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as { id?: number; name?: string; social_account?: string; fb_user?: string; fb_pass?: string; th_user?: string; th_pass?: string; ig_user?: string; ig_pass?: string; line_uid?: string; keywords?: string; persona?: string; client_info?: string; recent_activities?: string; fb_group_url?: string; fb_page_id?: string; meta_access_token?: string; threads_access_token?: string; ig_access_token?: string; image_style?: string };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  updateAiEditorClient(body.id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.social_account !== undefined && { social_account: body.social_account }),
    ...(body.fb_user !== undefined && { fb_user: body.fb_user }),
    ...(body.fb_pass !== undefined && { fb_pass: body.fb_pass }),
    ...(body.th_user !== undefined && { th_user: body.th_user }),
    ...(body.th_pass !== undefined && { th_pass: body.th_pass }),
    ...(body.ig_user !== undefined && { ig_user: body.ig_user }),
    ...(body.ig_pass !== undefined && { ig_pass: body.ig_pass }),
    ...(body.line_uid !== undefined && { line_uid: body.line_uid }),
    ...(body.keywords !== undefined && { keywords: body.keywords }),
    ...(body.persona !== undefined && { persona: body.persona }),
    ...(body.client_info !== undefined && { client_info: body.client_info }),
    ...(body.recent_activities !== undefined && { recent_activities: body.recent_activities }),
    ...(body.fb_group_url !== undefined && { fb_group_url: body.fb_group_url }),
    ...(body.fb_page_id !== undefined && { fb_page_id: body.fb_page_id }),
    ...(body.meta_access_token !== undefined && { meta_access_token: body.meta_access_token }),
    ...(body.threads_access_token !== undefined && { threads_access_token: body.threads_access_token }),
    ...(body.ig_access_token !== undefined && { ig_access_token: body.ig_access_token }),
    ...(body.image_style !== undefined && { image_style: body.image_style }),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json() as { id?: number };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteAiEditorClient(body.id);
  return NextResponse.json({ ok: true });
}
