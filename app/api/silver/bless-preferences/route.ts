import { NextRequest, NextResponse } from 'next/server';
import {
  getBlessPreference,
  setBlessPreferenceCategories,
  isValidBlessCategory,
  getUsersForBlessCategory,
  BLESS_CATEGORIES,
  BLESS_CATEGORY_LABELS,
  type BlessCategory,
} from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

const AVAILABLE = BLESS_CATEGORIES.map((value) => ({ value, label: BLESS_CATEGORY_LABELS[value] }));

// GET /api/silver/bless-preferences?userId=xxx
//   → { userId, categories: 已選類別[]（沒設定過就回全部類別）, available }
// GET /api/silver/bless-preferences?category=morning&recipients=1
//   → { category, users: [{userId, ...}] }，銀髮-長輩圖生成 排程用，決定這次要發給誰
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const category = req.nextUrl.searchParams.get('category');
  const recipients = req.nextUrl.searchParams.get('recipients');

  if (recipients && category) {
    if (!isValidBlessCategory(category)) {
      return NextResponse.json({ error: `不認得的類別：${category}`, available: AVAILABLE }, { status: 400 });
    }
    const users = getUsersForBlessCategory(category as BlessCategory);
    return NextResponse.json({ category, users });
  }

  if (userId) {
    const pref = getBlessPreference(userId);
    // 沒設定過 = 全部類別都要，跟 news 偏好預設空陣列的邏輯相反，
    // 這裡要顯性回全部類別，LIFF 頁的勾選框才會預設全勾
    return NextResponse.json({
      userId,
      categories: pref ? pref.categories : BLESS_CATEGORIES,
      available: AVAILABLE,
    });
  }

  return NextResponse.json({ error: '缺少 userId 或 category+recipients' }, { status: 400 });
}

// POST /api/silver/bless-preferences
// { userId, categories: string[] } 整批覆蓋
export async function POST(req: NextRequest) {
  const { userId, categories } = await req.json();
  if (!userId || !Array.isArray(categories)) {
    return NextResponse.json({ error: '缺少 userId 或 categories' }, { status: 400 });
  }
  const saved = setBlessPreferenceCategories(userId, categories);
  return NextResponse.json({ ok: true, categories: saved });
}
