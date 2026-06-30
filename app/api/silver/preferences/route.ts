import { NextRequest, NextResponse } from 'next/server';
import {
  getPreference,
  getAllPreferences,
  setPreferenceCategories,
  toggleNewsCategory,
  isValidNewsCategory,
  NEWS_CATEGORIES,
} from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

// GET /api/silver/preferences?userId=xxx
//   → { userId, categories: 已選類別[], available: 全部類別[] }，讓 n8n 直接拿去組選單
// GET /api/silver/preferences（不帶 userId）
//   → 所有人的偏好（給後台/排程用）
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    const pref = getPreference(userId);
    return NextResponse.json({
      userId,
      categories: pref?.categories ?? [],
      available: NEWS_CATEGORIES,
    });
  }
  return NextResponse.json({ preferences: getAllPreferences(), available: NEWS_CATEGORIES });
}

// POST /api/silver/preferences
// 兩種用法擇一：
//   A. 整批覆蓋：{ userId, categories: string[] }
//   B. 單一切換：{ userId, category: string, action?: 'toggle' | 'add' | 'remove' }（預設 toggle）
// 都回傳 { ok: true, categories: 切換後實際存下的類別[] }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, categories, category, action } = body ?? {};

  if (!userId) {
    return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
  }

  // A. 整批覆蓋
  if (Array.isArray(categories)) {
    const saved = setPreferenceCategories(userId, categories);
    return NextResponse.json({ ok: true, categories: saved });
  }

  // B. 單一切換
  if (typeof category === 'string' && category.trim()) {
    if (!isValidNewsCategory(category.trim())) {
      return NextResponse.json(
        { error: `不認得的類別：${category}`, available: NEWS_CATEGORIES },
        { status: 400 },
      );
    }
    const mode = action === 'add' || action === 'remove' ? action : 'toggle';
    const saved = toggleNewsCategory(userId, category.trim(), mode);
    return NextResponse.json({ ok: true, categories: saved });
  }

  return NextResponse.json(
    { error: '缺少 categories 或 category', available: NEWS_CATEGORIES },
    { status: 400 },
  );
}
