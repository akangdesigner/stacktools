import { NextRequest, NextResponse } from 'next/server';
import { createFoodLogBatch, getFoodLogBatch, getLatestFoodLogBatch, updateFoodLogItem, type FoodLogItemInput } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

// 一次拍照/描述辨識出的多品項一起寫入（AI 辨識與換算已在 ai-linebot 端做完，
// 這裡只負責存），回傳含 id 的完整列，供上層代理層直接轉發給前端
export async function POST(req: NextRequest) {
  const { userId, items, advice, source } = await req.json();
  if (!userId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '缺少 userId 或 items' }, { status: 400 });
  }
  const clean: FoodLogItemInput[] = items.map((it) => ({
    foodName: String(it.foodName ?? ''),
    quantityDesc: it.quantityDesc ?? null,
    grams: it.grams ?? null,
    calories: it.calories ?? null,
    proteinG: it.proteinG ?? null,
    carbG: it.carbG ?? null,
    fatG: it.fatG ?? null,
    hasVegetable: Boolean(it.hasVegetable),
    nutritionSource: it.nutritionSource ?? null,
    sourceName: it.sourceName ?? null,
  }));
  const result = createFoodLogBatch(userId, clean, String(advice ?? ''), source || 'liff');
  return NextResponse.json(result);
}

// ?userId= 查最新一批；?batchId= 查指定批次
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const batchId = req.nextUrl.searchParams.get('batchId');

  if (batchId) {
    return NextResponse.json({ items: getFoodLogBatch(batchId) });
  }
  if (userId) {
    return NextResponse.json({ items: getLatestFoodLogBatch(userId) });
  }
  return NextResponse.json({ error: '缺少 userId 或 batchId' }, { status: 400 });
}

// 編輯單一品項（品名/份量/數字），呼叫端已重新估算好數字才會打這支
export async function PATCH(req: NextRequest) {
  const { id, food_name, quantity_desc, calories, protein_g, carb_g, fat_g } = await req.json();
  if (!id || !food_name) {
    return NextResponse.json({ error: '缺少 id 或 food_name' }, { status: 400 });
  }
  updateFoodLogItem(Number(id), {
    foodName: food_name,
    quantityDesc: quantity_desc ?? null,
    calories: calories ?? null,
    proteinG: protein_g ?? null,
    carbG: carb_g ?? null,
    fatG: fat_g ?? null,
  });
  return NextResponse.json({ ok: true });
}
