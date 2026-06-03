import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSetting, WriterSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<WriterSettings>;
  const allowed: (keyof WriterSettings)[] = ['schedule_sheet_id', 'schedule_sheet_tab', 'clients_sheet_id', 'clients_sheet_tab', 'progress_tracking_sheet_id'];
  for (const key of allowed) {
    if (key in body) setSetting(key, body[key] ?? '');
  }
  return NextResponse.json({ ok: true });
}
