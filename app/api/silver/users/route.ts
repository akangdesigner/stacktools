import { NextRequest, NextResponse } from 'next/server';
import { getUser, getAllUsers, upsertUser, updateUser, deleteUser } from '@/lib/silverDb';

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

// PATCH：編輯用戶基本資料（直接覆蓋，允許清空欄位）
export async function PATCH(req: NextRequest) {
  const { userId, nickname, age, gender } = await req.json();
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  updateUser(userId, nickname ?? null, age ?? null, gender ?? null);
  return NextResponse.json({ ok: true });
}

// DELETE：刪除用戶，連同其所有關聯資料
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  deleteUser(userId);
  return NextResponse.json({ ok: true });
}
