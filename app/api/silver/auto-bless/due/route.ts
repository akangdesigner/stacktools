import { NextRequest, NextResponse } from 'next/server';
import { getUsersDueForAutoBless } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

// n8n 定時呼叫：GET /api/silver/auto-bless/due?slot=2024-06-26_09
// 回傳這個 slot 還沒收到自動祝福圖的用戶清單
export async function GET(req: NextRequest) {
  const slot = req.nextUrl.searchParams.get('slot');
  if (!slot) return NextResponse.json({ error: 'missing slot' }, { status: 400 });

  const users = getUsersDueForAutoBless(slot);
  return NextResponse.json({ slot, users });
}
