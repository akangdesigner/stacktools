import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSetting, WriterSettings, getUserWritingGuide, setUserWritingGuide, DEFAULT_WRITING_GUIDE } from '@/lib/writerDb';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const base = getSettings();
  const personal = session?.user?.email
    ? getUserWritingGuide(session.user.email)
    : '';
  // 沒填過個人指引的帳號，自動帶入預設內容（在設定裡存檔後才會成為自己的版本）
  const writing_guide = personal.trim() ? personal : DEFAULT_WRITING_GUIDE;
  return NextResponse.json({ ...base, writing_guide });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json() as Partial<WriterSettings> & { writing_guide?: string };
  const allowed: (keyof WriterSettings)[] = ['schedule_sheet_id', 'schedule_sheet_tab', 'clients_sheet_id', 'clients_sheet_tab', 'progress_tracking_sheet_id', 'openrouter_model'];
  for (const key of allowed) {
    if (key in body) setSetting(key, body[key] ?? '');
  }
  if ('writing_guide' in body && session?.user?.email) {
    setUserWritingGuide(session.user.email, body.writing_guide ?? '');
  }
  return NextResponse.json({ ok: true });
}
