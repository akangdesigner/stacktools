import { NextRequest, NextResponse } from 'next/server';
import { createRecommendationJob, updateRecommendationJob } from '@/lib/recommendation-jobs';
import { postN8nWebhook, buildRecommendationWebhookTarget } from '@/lib/n8n-webhook';

export async function POST(req: NextRequest) {
  const { title, keywords, searchTerm, requiredBrand, introLink } = await req.json();

  if (!title || !keywords || !searchTerm) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const input = {
    title: String(title).trim(),
    keywords: String(keywords).trim(),
    searchTerm: String(searchTerm).trim(),
    requiredBrand: String(requiredBrand ?? '').trim(),
    introLink: String(introLink ?? '').trim(),
  };

  createRecommendationJob(jobId, input);

  // 固定用正式網域，req.nextUrl.origin 在 Zeabur 上會抓到已棄用的舊網域
  const callbackUrl = 'https://tool.dg166.com/api/recommendation/callback';

  // 觸發 n8n「品牌查詢」與「大綱生成」兩支工作流，各自非同步回呼 callback
  const [brandsResult, outlineResult] = await Promise.all([
    postN8nWebhook(buildRecommendationWebhookTarget('品牌查詢', 'rec-step1-brands'), {
      jobId,
      callbackUrl,
      title: input.title,
      searchTerm: input.searchTerm,
      requiredBrand: input.requiredBrand,
    }),
    postN8nWebhook(buildRecommendationWebhookTarget('大綱生成', 'rec-step2-outline'), {
      jobId,
      callbackUrl,
      title: input.title,
      keywords: input.keywords,
      searchTerm: input.searchTerm,
    }),
  ]);

  const errors = [brandsResult, outlineResult]
    .filter((r): r is { ok: false; error: string } => !r.ok)
    .map((r) => r.error);

  if (errors.length > 0) {
    updateRecommendationJob(jobId, 'failed', errors.join('；'));
    return NextResponse.json({ error: errors.join('；') }, { status: 502 });
  }

  return NextResponse.json({
    jobId,
    status: 'researching',
    message: '正在查詢品牌與生成大綱',
  });
}
