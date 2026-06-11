import { NextRequest, NextResponse } from 'next/server';
import {
  applyStageResult,
  updateRecommendationJob,
  RecommendationStage,
  RecommendationJobData,
} from '@/lib/recommendation-jobs';

// n8n 各階段回傳：{ jobId, stage: "brands" | "outline" | "final", status: "completed" | "failed", message?, data? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;
  const stage = body?.stage as RecommendationStage | undefined;
  const status = body?.status as 'completed' | 'failed' | undefined;
  const message = (body?.message as string | undefined) || '';
  const data = (body?.data as RecommendationJobData | undefined) ?? {};

  if (!jobId || !status) {
    return NextResponse.json({ error: '缺少 jobId 或 status' }, { status: 400 });
  }

  if (status === 'failed') {
    const stageLabel =
      stage === 'brands' ? '品牌查詢' : stage === 'outline' ? '大綱生成' : '文章生成';
    const updated = updateRecommendationJob(
      jobId,
      'failed',
      message || `${stageLabel}失敗，請稍後重試或檢查流程設定。`
    );
    if (!updated) {
      return NextResponse.json({ error: '找不到任務' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!stage) {
    return NextResponse.json({ error: '缺少 stage' }, { status: 400 });
  }

  const updated = applyStageResult(jobId, stage, data, message || undefined);
  if (!updated) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
