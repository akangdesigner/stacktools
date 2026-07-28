import { NextRequest, NextResponse } from 'next/server';
import { getUser, getAllUsers, upsertUser, updateUser, deleteUser, isValidPersona, isValidChronicDisease } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ users: getAllUsers() });
  const user = getUser(userId);
  return NextResponse.json({ user });
}

// 陣列裡每個 key 都要合法，錯字/舊資料殘留直接擋下，避免存進亂七八糟的值。
// 丟 Error 而不是回傳混合型別，讓呼叫端用 try/catch 處理，型別也乾淨。
function validateChronicDiseases(list: unknown): string | null {
  if (list == null) return null;
  if (!Array.isArray(list)) throw new Error('chronicDiseases 必須是陣列');
  for (const key of list) {
    if (typeof key !== 'string' || !isValidChronicDisease(key)) {
      throw new Error(`不認得的慢性病選項：${key}`);
    }
  }
  return list.length > 0 ? list.join(',') : null;
}

export async function POST(req: NextRequest) {
  const { userId, nickname, age, gender, botName, persona, chronicDiseases, chronicOther, avoidFoods } = await req.json();
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  if (persona != null && !isValidPersona(persona)) {
    return NextResponse.json({ error: `不認得的 persona：${persona}` }, { status: 400 });
  }
  try {
    upsertUser(userId, {
      nickname: nickname ?? null,
      age: age ?? null,
      gender: gender ?? null,
      botName: botName ?? null,
      persona: persona ?? null,
      chronicDiseases: validateChronicDiseases(chronicDiseases),
      chronicOther: chronicOther ?? null,
      avoidFoods: avoidFoods ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH：編輯用戶基本資料（直接覆蓋，允許清空欄位）
export async function PATCH(req: NextRequest) {
  const { userId, nickname, age, gender, botName, persona, chronicDiseases, chronicOther, avoidFoods } = await req.json();
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  if (persona != null && !isValidPersona(persona)) {
    return NextResponse.json({ error: `不認得的 persona：${persona}` }, { status: 400 });
  }
  try {
    updateUser(userId, {
      nickname: nickname ?? null,
      age: age ?? null,
      gender: gender ?? null,
      botName: botName ?? null,
      persona: persona ?? null,
      chronicDiseases: validateChronicDiseases(chronicDiseases),
      chronicOther: chronicOther ?? null,
      avoidFoods: avoidFoods ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE：刪除用戶，連同其所有關聯資料
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  deleteUser(userId);
  return NextResponse.json({ ok: true });
}
