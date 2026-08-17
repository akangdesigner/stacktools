import { NextRequest, NextResponse } from 'next/server';
import {
  applyStageResult,
  updateRecommendationJob,
  RecommendationStage,
  RecommendationJobData,
} from '@/lib/recommendation-jobs';
import { generateTitleSuggestions } from '@/lib/recommendation-step1';

// n8n 各階段回傳：{ jobId, stage: "brands" | "outline" | "brand_details" | "final", status: "completed" | "failed", message?, data? }
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
      stage === 'brands' ? '品牌查詢' :
      stage === 'outline' ? '大綱生成' :
      stage === 'brand_details' ? '品牌深度研究' : '文章生成';
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

  // 品牌清單一到，順便本地補生成標題建議（n8n 品牌查詢工作流沒有這個環節）
  if (stage === 'brands' && updated.data.brands) {
    generateTitleSuggestions(jobId, updated.input, updated.data.brands).catch(() => {
      // 已在函式內自行 fallback 成空陣列，這裡不需要再處理
    });
  }

  // 品牌深度研究跑完後不再自動接著生成文章，停在 awaiting_final_confirm
  // 讓使用者看過深度研究結果再按確認（見 /api/recommendation/generate-final）

  return NextResponse.json({ ok: true });
}
