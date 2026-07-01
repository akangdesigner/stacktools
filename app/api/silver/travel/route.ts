import { NextRequest, NextResponse } from 'next/server';
import {
  saveTravelCache,
  getTravelCache,
  advanceTravelBatch,
  resetTravelBatch,
  type TravelItem,
} from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 3; // 一批 3 個，旅遊卡片資訊量大（圖＋交通＋季節），一次 3 個長輩剛好看得完

// 依目前批次切出該批景點，並算好按鈕／進度需要的資訊
function buildBatch(travel: TravelItem[], batchIndex: number) {
  const totalBatches = Math.max(1, Math.ceil(travel.length / BATCH_SIZE));
  const safeIndex = Math.min(Math.max(batchIndex, 0), totalBatches - 1);
  const start = safeIndex * BATCH_SIZE;
  const items = travel.slice(start, start + BATCH_SIZE);
  return {
    travel: items, // 這一批的景點（最多 3 個）
    batchIndex: safeIndex, // 第幾批（0 起算）
    batchNumber: safeIndex + 1, // 第幾批（1 起算，給長輩看的）
    totalBatches, // 今日共幾批
    total: travel.length, // 今日總景點數
    rangeStart: start + 1, // 這批是第幾個開始
    rangeEnd: start + items.length, // 這批到第幾個
    hasMore: safeIndex < totalBatches - 1, // 還有下一批嗎（決定按鈕要不要顯示「看更多」）
    isLast: safeIndex >= totalBatches - 1, // 是不是最後一批（最後一批按鈕換成「從頭再看」）
  };
}

// POST /api/silver/travel
// body: { userId, travel: TravelItem[] }
// n8n 抓完今日旅遊景點（最多 15 個）後存入，並回傳第一批 3 個
export async function POST(req: NextRequest) {
  const { userId, travel } = await req.json();
  if (!userId || !Array.isArray(travel) || travel.length === 0) {
    return NextResponse.json({ error: '缺少 userId 或 travel' }, { status: 400 });
  }
  const trimmed = (travel as TravelItem[]).slice(0, 15); // 上限 15 個
  saveTravelCache(userId, trimmed);
  return NextResponse.json(buildBatch(trimmed, 0));
}

// GET /api/silver/travel?userId=xxx&action=next|reset|current
// next   = 看更多（前進一批）
// reset  = 從頭再看一次（進度歸零）
// current= 目前這一批（預設）
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const action = req.nextUrl.searchParams.get('action') ?? 'current';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  const cache = getTravelCache(userId);
  // 沒有今日快取（還沒抓過、或快取是昨天的）→ 告訴 n8n 該重新抓景點
  if (!cache) return NextResponse.json({ noCache: true });

  const travel = JSON.parse(cache.travelJson) as TravelItem[];
  const totalBatches = Math.max(1, Math.ceil(travel.length / BATCH_SIZE));

  if (action === 'reset') {
    resetTravelBatch(userId);
    return NextResponse.json(buildBatch(travel, 0));
  }

  if (action === 'next') {
    // 已經是最後一批還想看更多 → 不再前進，回 done 讓 n8n 提示「看完囉／從頭再看」
    if (cache.batchIndex >= totalBatches - 1) {
      return NextResponse.json({ ...buildBatch(travel, cache.batchIndex), done: true });
    }
    const newIndex = advanceTravelBatch(userId);
    return NextResponse.json(buildBatch(travel, newIndex));
  }

  // current
  return NextResponse.json(buildBatch(travel, cache.batchIndex));
}
