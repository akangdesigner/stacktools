import { NextRequest, NextResponse } from 'next/server';
import { getPreference, getAllPreferences, upsertPreference } from '@/lib/silverDb';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    const pref = getPreference(userId);
    return NextResponse.json(pref ?? { userId, category: null });
  }
  return NextResponse.json(getAllPreferences());
}

export async function POST(req: NextRequest) {
  const { userId, category } = await req.json();
  if (!userId || !category) {
    return NextResponse.json({ error: '缺少 userId 或 category' }, { status: 400 });
  }
  upsertPreference(userId, category);
  return NextResponse.json({ ok: true });
}
