import { NextRequest, NextResponse } from 'next/server';
import { getPendingAction, setPendingAction } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  return NextResponse.json({ pendingAction: getPendingAction(userId) });
}

export async function POST(req: NextRequest) {
  const { userId, action } = await req.json();
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  setPendingAction(userId, action ?? null);
  return NextResponse.json({ ok: true });
}
