import { NextRequest, NextResponse } from 'next/server';
import { getMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting } from '@/lib/meetingsDb';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const meeting = getMeeting(Number(id));
    if (!meeting) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(meeting);
  }
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

export async function PATCH(req: NextRequest) {
  const { id, title, date, attendees, content } = await req.json();
  if (!id || !title?.trim() || !date) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  }
  updateMeeting(Number(id), title.trim(), date, attendees ?? [], (content ?? '').trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteMeeting(Number(id));
  return NextResponse.json({ ok: true });
}
