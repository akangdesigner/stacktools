import { NextRequest, NextResponse } from 'next/server';
import { getPendingReminders, syncOverdueStatus } from '@/lib/financeDb';

export async function GET(req: NextRequest) {
  syncOverdueStatus();
  const type = req.nextUrl.searchParams.get('type') as '5day' | '2day' | 'overdue' | null;

  if (!type || !['5day', '2day', 'overdue'].includes(type)) {
    return NextResponse.json({ error: 'type 參數需為 5day、2day 或 overdue' }, { status: 400 });
  }

  const reminders = getPendingReminders(type);
  return NextResponse.json(reminders);
}
