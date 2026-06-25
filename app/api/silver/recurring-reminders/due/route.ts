import { NextResponse } from 'next/server';
import { getRecurringRemindersDueToday, RecurringReminder } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const reminders = getRecurringRemindersDueToday();

  const byUser: Record<string, RecurringReminder[]> = {};
  for (const r of reminders) {
    if (!byUser[r.userId]) byUser[r.userId] = [];
    byUser[r.userId].push(r);
  }

  const users = Object.entries(byUser).map(([userId, userReminders]) => ({
    userId,
    reminders: userReminders,
  }));

  return NextResponse.json({ users });
}
