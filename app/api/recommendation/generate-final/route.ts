import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationJob, updateRecommendationJob } from '@/lib/recommendation-jobs';
import { postN8nWebhook, buildRecommendationWebhookTarget } from '@/lib/n8n-webhook';

// 第三段：使用者看過品牌深度研究結果（awaiting_final_confirm）後按確認，才觸發「完整生成」workflow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;

  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getRecommendationJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }
  if (job.status !== 'awaiting_final_confirm') {
    return NextResponse.json(
      { error: `任務狀態為 ${job.status}，無法開始生成` },
      { status: 409 }
    );
  }

  const callbackUrl = 'https://tool.dg166.com/api/recommendation/callback';
  const result = await postN8nWebhook(
    buildRecommendationWebhookTarget('完整生成', 'rec-step3-generate'),
    {
      jobId,
      callbackUrl,
      title: job.data.confirmedTitle || job.input.title,
      keywords: job.input.keywords,
      searchTerm: job.input.searchTerm,
      brand: job.input.requiredBrand,
      introLink: job.input.introLink,
      brands: job.data.brands ?? [],
      outline: job.data.outline ?? '',
      references: job.data.references ?? '',
      brandDetails: job.data.brandDetails ?? [],
      cardTemplate: job.data.cardTemplate || 'general',
      categoryName: job.data.categoryName || '',
      tags: job.data.tags ?? [],
      // 這個生成器本來就只產「推薦文」，不用讓使用者選，固定送這個值給 n8n 打 article_type taxonomy
      articleType: 'recommendation',
    }
  );

  if (!result.ok) {
    updateRecommendationJob(jobId, 'failed', result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  updateRecommendationJob(jobId, 'generating', '文章生成中（約 3～5 分鐘）');
  return NextResponse.json({ jobId, status: 'generating' });
}
