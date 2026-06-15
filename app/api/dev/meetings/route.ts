import { NextRequest, NextResponse } from 'next/server';
import { getMeetings, createMeeting, deleteMeeting } from '@/lib/meetingsDb';

export async function GET() {
  return NextResponse.json(getMeetings());
}

export async function POST(req: NextRequest) {
  const { title, date, attendees, content } = await req.json();
  if (!title?.trim() || !date) {
    return NextResponse.json({ error: '標題與日期為必填' }, { status: 400 });
  }
  const id = createMeeting(title.trim(), date, attendees ?? [], (content ?? '').trim());
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteMeeting(Number(id));
  return NextResponse.json({ ok: true });
}
