import { NextRequest, NextResponse } from 'next/server';
import {
  createAutoBlessSend,
  setAutoBlessSendDriveFile,
  getActiveAutoBlessSend,
  markAutoBlessCustomizeUsed,
} from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, slot, theme, content } = await req.json();
  if (!userId || !slot || !theme || !content) {
    return NextResponse.json({ error: '缺少 userId、slot、theme 或 content' }, { status: 400 });
  }
  return NextResponse.json(createAutoBlessSend(userId, slot, theme, content));
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  return NextResponse.json({ send: getActiveAutoBlessSend(userId) });
}

export async function PATCH(req: NextRequest) {
  const { id, driveFileId, markCustomizeUsed } = await req.json();
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  if (driveFileId) setAutoBlessSendDriveFile(Number(id), driveFileId);
  if (markCustomizeUsed) markAutoBlessCustomizeUsed(Number(id));
  return NextResponse.json({ ok: true });
}
