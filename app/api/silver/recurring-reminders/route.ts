import { NextRequest, NextResponse } from 'next/server';
import { createRecurringReminder, getUserRecurringReminders, getAllRecurringReminders, deleteRecurringReminder } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, description, daysOfWeek } = await req.json();
  if (!userId || !description || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
    return NextResponse.json({ error: '缺少 userId、description 或 daysOfWeek' }, { status: 400 });
  }
  const id = createRecurringReminder(userId, description, daysOfWeek);
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    return NextResponse.json({ reminders: getUserRecurringReminders(userId) });
  }
  return NextResponse.json({ reminders: getAllRecurringReminders() });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  deleteRecurringReminder(Number(id));
  return NextResponse.json({ ok: true });
}
