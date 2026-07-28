import { NextRequest, NextResponse } from 'next/server';
import { getRecurringRemindersDueAt, markReminderSent, RecurringReminder } from '@/lib/silverDb';

// 銀髮固定提醒 — 依長輩自選的整點時間推播。
//
// 取代原本 n8n「銀髮-排程-固定提醒」每天固定 8:30 推全部的做法（那支現在完全沒有
// 時間概念，長輩沒得選）。改由 GitHub Actions 每 15 分鐘打這支一次，這裡自己算
// 「現在台灣時間是星期幾、幾點整」，只推剛好排在這個整點的提醒。
//
// 用 slot（例如 "2026-07-28_08"）擋同一則提醒同一個時段被重複推播（排程重疊、
// GitHub Actions 延遲跨到下一輪都可能發生），做法跟 auto_bless_sends 同一套。
export const dynamic = 'force-dynamic';

function taipeiNow(): { dayOfWeek: number; hour: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // hour12:false 的 24 時制在午夜會回 "24"，要當 0 點看
  const hour = Number(get('hour')) % 24;
  return {
    dayOfWeek: weekdayMap[get('weekday')] ?? 0,
    hour,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

async function pushToLine(token: string, userId: string, reminders: RecurringReminder[]): Promise<void> {
  const lines = reminders.map((r) => `🩺 ${r.description}`).join('\n');
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: `⏰ 今天要記得\n\n${lines}` }],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`LINE push 失敗（${res.status}）：${raw.slice(0, 300)}`);
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.SILVER_LINE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: '伺服器尚未設定 SILVER_LINE_TOKEN 環境變數' }, { status: 500 });
  }

  const { dayOfWeek, hour, dateStr } = taipeiNow();
  const slotPrefix = `${dateStr}_${String(hour).padStart(2, '0')}`;
  const due = getRecurringRemindersDueAt(dayOfWeek, hour);

  // dryRun：只回這個時段「應該」推給誰、推什麼，不真的呼叫 LINE、也不寫 sent 紀錄——
  // 用來安全驗證邏輯，不會不小心真的推播出去
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  const byUser = new Map<string, RecurringReminder[]>();
  for (const r of due) {
    // 先佔位判斷這個時段有沒有推過，佔到位才算「這次要推的」（dryRun 不寫入，只預覽）
    if (!dryRun) {
      const { alreadySent } = markReminderSent(r.id, slotPrefix);
      if (alreadySent) continue;
    }
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  const results: { userId: string; count: number; ok: boolean; error?: string }[] = [];
  for (const [userId, reminders] of byUser) {
    if (dryRun) {
      results.push({ userId, count: reminders.length, ok: true });
      continue;
    }
    try {
      await pushToLine(token, userId, reminders);
      results.push({ userId, count: reminders.length, ok: true });
    } catch (e) {
      results.push({ userId, count: reminders.length, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ slot: slotPrefix, dryRun, pushedUsers: results.length, results });
}
