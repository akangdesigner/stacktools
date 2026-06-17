import { NextRequest, NextResponse } from 'next/server';
import { getUser, getAllUsers, upsertUser } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ users: getAllUsers() });
  const user = getUser(userId);
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  const { userId, nickname, age, gender } = await req.json();
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  upsertUser(userId, nickname ?? null, age ?? null, gender ?? null);
  return NextResponse.json({ ok: true });
}
