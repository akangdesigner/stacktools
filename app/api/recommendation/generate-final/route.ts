import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationJob, updateRecommendationJob } from '@/lib/recommendation-jobs';
import { postN8nWebhook, buildRecommendationWebhookTarget } from '@/lib/n8n-webhook';

// 第三段：使用者看過品牌深度研究結果（awaiting_final_confirm）後按確認，才觸發「完整生成」workflow
//
// 帶 retry: true 時是「第五階段重送」：n8n 中途掛掉沒回 callback（job 永遠停在 generating），
// 或已經回報 failed，都可以用同一份 DB 資料重打一次 webhook，不用把前四階段的研究重跑一遍。
const RETRYABLE_STATUSES = ['generating', 'failed'];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;
  const retry = body?.retry === true;

  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getRecommendationJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  const allowed = retry
    ? ['awaiting_final_confirm', ...RETRYABLE_STATUSES]
    : ['awaiting_final_confirm'];
  if (!allowed.includes(job.status)) {
    return NextResponse.json(
      { error: `任務狀態為 ${job.status}，無法開始生成` },
      { status: 409 }
    );
  }

  // 重送前先確認前四階段的成果還在，不然打過去 n8n 也只會生出空文章
  if (retry && !(job.data.brands ?? []).length) {
    return NextResponse.json(
      { error: '這個任務沒有品牌資料，無法重送，請重新查詢品牌與大綱' },
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
      // product = 實體商品（n8n 要抓真實商品圖進卡片）；service = 服務／公司（不抓）
      subjectType: job.input.subjectType,
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

  updateRecommendationJob(
    jobId,
    'generating',
    retry ? '已重新送出，文章生成中（約 3～5 分鐘）' : '文章生成中（約 3～5 分鐘）'
  );
  return NextResponse.json({ jobId, status: 'generating', retried: retry });
}
