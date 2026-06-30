import { NextRequest, NextResponse } from 'next/server';
import { createRecommendationJob, updateRecommendationJob } from '@/lib/recommendation-jobs';
import { runRecommendationPhase1 } from '@/lib/recommendation-step1';

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

  // 背景執行 Phase 1（Tavily 品牌查詢 + Claude 大綱生成），不等待
  runRecommendationPhase1(jobId, input).catch((err) => {
    updateRecommendationJob(jobId, 'failed', `第一階段失敗：${String(err)}`);
  });

  return NextResponse.json({
    jobId,
    status: 'researching',
    message: '正在查詢品牌與生成大綱',
  });
}
