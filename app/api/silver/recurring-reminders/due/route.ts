import { NextResponse } from 'next/server';
import { getRecurringRemindersDueAt, taipeiDayAndHour, RecurringReminder } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

// n8n「銀髮-排程-固定提醒」現在每小時整點跑一次，這裡自己算台灣時區的星期幾＋
// 現在幾點整，只回這個時段該推的提醒（長輩自選的 remindTime），不用 n8n 那邊加任何
// 判斷節點——過濾邏輯全部留在後端，n8n 只要負責「準時觸發」跟「把回傳的訊息送出去」。
export async function GET() {
  const { dayOfWeek, hour } = taipeiDayAndHour();
  const reminders = getRecurringRemindersDueAt(dayOfWeek, hour);

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
