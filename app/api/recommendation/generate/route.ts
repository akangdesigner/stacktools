import { NextRequest, NextResponse } from 'next/server';
import {
  getRecommendationJob,
  updateRecommendationJob,
  RecommendationBrand,
} from '@/lib/recommendation-jobs';
import { postN8nWebhook, buildRecommendationWebhookTarget } from '@/lib/n8n-webhook';

// 第二段：使用者確認品牌與大綱後，觸發「完整生成」workflow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;
  const brands = body?.brands as RecommendationBrand[] | undefined;
  const outline = body?.outline as string | undefined;

  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }
  if (!Array.isArray(brands) || brands.length === 0) {
    return NextResponse.json({ error: '品牌清單不可為空' }, { status: 400 });
  }
  if (!outline || !outline.trim()) {
    return NextResponse.json({ error: '大綱不可為空' }, { status: 400 });
  }

  const job = getRecommendationJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }
  if (job.status !== 'awaiting_confirm') {
    return NextResponse.json(
      { error: `任務狀態為 ${job.status}，無法開始生成` },
      { status: 409 }
    );
  }

  const cleanedBrands = brands
    .map((b) => ({
      brand_name: String(b?.brand_name ?? '').trim(),
      official_url: String(b?.official_url ?? '').trim(),
    }))
    .filter((b) => b.brand_name);

  if (cleanedBrands.length === 0) {
    return NextResponse.json({ error: '品牌清單不可為空' }, { status: 400 });
  }

  const callbackBaseUrl = process.env.RECOMMENDATION_CALLBACK_BASE_URL || req.nextUrl.origin;
  const callbackUrl = `${callbackBaseUrl}/api/recommendation/callback`;

  const result = await postN8nWebhook(
    buildRecommendationWebhookTarget('完整生成', 'rec-step3-generate'),
    {
      jobId,
      callbackUrl,
      title: job.input.title,
      keywords: job.input.keywords,
      searchTerm: job.input.searchTerm,
      brand: job.input.requiredBrand,
      introLink: job.input.introLink,
      brands: cleanedBrands,
      outline: outline.trim(),
      references: job.data.references ?? '',
    }
  );

  if (!result.ok) {
    updateRecommendationJob(jobId, 'failed', result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  updateRecommendationJob(jobId, 'generating', '文章生成中（約 3～5 分鐘）');
  return NextResponse.json({ jobId, status: 'generating' });
}
