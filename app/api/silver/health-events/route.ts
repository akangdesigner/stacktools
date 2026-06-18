import { NextRequest, NextResponse } from 'next/server';
import { createHealthEvent, getUserPendingEvents, resolveUserSymptoms, resolveHealthEvent } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, type, description } = await req.json();
  if (!userId || !type || !description) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  const id = createHealthEvent(userId, type, description);
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  const events = getUserPendingEvents(userId);
  return NextResponse.json({ events });
}

export async function PATCH(req: NextRequest) {
  const { id, userId, action } = await req.json();
  if (action === 'resolve' && id) {
    resolveHealthEvent(Number(id));
    return NextResponse.json({ ok: true });
  }
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  if (action === 'resolve_symptoms') {
    resolveUserSymptoms(userId);
  }
  return NextResponse.json({ ok: true });
}
