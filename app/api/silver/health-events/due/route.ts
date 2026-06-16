import { NextResponse } from 'next/server';
import { getPendingEvents, HealthEvent } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = getPendingEvents();

  // 依 userId 分組
  const byUser: Record<string, HealthEvent[]> = {};
  for (const e of events) {
    if (!byUser[e.userId]) byUser[e.userId] = [];
    byUser[e.userId].push(e);
  }

  const users = Object.entries(byUser).map(([userId, userEvents]) => ({
    userId,
    events: userEvents,
  }));

  return NextResponse.json({ users });
}
