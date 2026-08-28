import { NextRequest, NextResponse } from 'next/server';
import {
  getRecommendationJob,
  updateRecommendationJob,
  confirmBrandsAndStartDetailResearch,
  RecommendationBrand,
} from '@/lib/recommendation-jobs';
import { postN8nWebhook, buildRecommendationWebhookTarget } from '@/lib/n8n-webhook';

// 第二段：使用者確認品牌與大綱後，觸發「品牌深度研究」workflow（不是直接生成文章）
// 深度研究跑完後停在 awaiting_final_confirm，使用者看過結果再按確認才觸發「完整生成」（見 generate-final/route.ts）
export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;
  const brands = body?.brands as RecommendationBrand[] | undefined;
  const outline = body?.outline as string | undefined;
  const title = body?.title as string | undefined;
  const cardTemplate = (body?.cardTemplate as string | undefined) || "general";
  const categoryId = (body?.categoryId as string | undefined) || "";

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

  // 固定用正式網域，req.nextUrl.origin 在 Zeabur 上會抓到已棄用的舊網域
  const callbackUrl = 'https://tool.dg166.com/api/recommendation/callback';
  const confirmedTitle = title?.trim() || job.input.title;

  const result = await postN8nWebhook(
    buildRecommendationWebhookTarget('品牌深度研究', 'rec-step1b-branddetails'),
    {
      jobId,
      callbackUrl,
      brands: cleanedBrands,
      searchTerm: job.input.searchTerm,
    }
  );

  if (!result.ok) {
    updateRecommendationJob(jobId, 'failed', result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  confirmBrandsAndStartDetailResearch(jobId, cleanedBrands, outline.trim(), confirmedTitle, cardTemplate, categoryId);
  return NextResponse.json({ jobId, status: 'researching_details' });
}
