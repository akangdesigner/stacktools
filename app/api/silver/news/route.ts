import { NextRequest, NextResponse } from 'next/server';
import {
  saveNewsCache,
  getNewsCache,
  advanceNewsBatch,
  resetNewsBatch,
  type NewsItem,
} from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 5; // 一批 5 則，長輩一次看 5 則剛好

// 依目前批次切出該批新聞，並算好按鈕／進度需要的資訊
function buildBatch(news: NewsItem[], batchIndex: number) {
  const totalBatches = Math.max(1, Math.ceil(news.length / BATCH_SIZE));
  const safeIndex = Math.min(Math.max(batchIndex, 0), totalBatches - 1);
  const start = safeIndex * BATCH_SIZE;
  const items = news.slice(start, start + BATCH_SIZE);
  return {
    news: items, // 這一批的新聞（最多 5 則）
    batchIndex: safeIndex, // 第幾批（0 起算）
    batchNumber: safeIndex + 1, // 第幾批（1 起算，給長輩看的）
    totalBatches, // 今日共幾批
    total: news.length, // 今日總則數
    rangeStart: start + 1, // 這批是第幾則開始
    rangeEnd: start + items.length, // 這批到第幾則
    hasMore: safeIndex < totalBatches - 1, // 還有下一批嗎（決定按鈕要不要顯示「看更多」）
    isLast: safeIndex >= totalBatches - 1, // 是不是最後一批（最後一批按鈕換成「從頭再看」）
  };
}

// POST /api/silver/news
// body: { userId, news: NewsItem[] }
// n8n 抓完今日新聞（最多 20 則）後存入，並回傳第一批 5 則
export async function POST(req: NextRequest) {
  const { userId, news } = await req.json();
  if (!userId || !Array.isArray(news) || news.length === 0) {
    return NextResponse.json({ error: '缺少 userId 或 news' }, { status: 400 });
  }
  const trimmed = (news as NewsItem[]).slice(0, 20); // 上限 20 則
  saveNewsCache(userId, trimmed);
  return NextResponse.json(buildBatch(trimmed, 0));
}

// GET /api/silver/news?userId=xxx&action=next|reset|current
// next   = 看更多（前進一批）
// reset  = 從頭再看一次（進度歸零）
// current= 目前這一批（預設）
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const action = req.nextUrl.searchParams.get('action') ?? 'current';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  const cache = getNewsCache(userId);
  // 沒有今日快取（還沒抓過、或快取是昨天的）→ 告訴 n8n 該重新抓新聞
  if (!cache) return NextResponse.json({ noCache: true });

  const news = JSON.parse(cache.newsJson) as NewsItem[];
  const totalBatches = Math.max(1, Math.ceil(news.length / BATCH_SIZE));

  if (action === 'reset') {
    resetNewsBatch(userId);
    return NextResponse.json(buildBatch(news, 0));
  }

  if (action === 'next') {
    // 已經是最後一批還想看更多 → 不再前進，回 done 讓 n8n 提示「看完囉／從頭再看」
    if (cache.batchIndex >= totalBatches - 1) {
      return NextResponse.json({ ...buildBatch(news, cache.batchIndex), done: true });
    }
    const newIndex = advanceNewsBatch(userId);
    return NextResponse.json(buildBatch(news, newIndex));
  }

  // current
  return NextResponse.json(buildBatch(news, cache.batchIndex));
}
