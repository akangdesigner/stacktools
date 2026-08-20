import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationJob, revertToAwaitingConfirm } from '@/lib/recommendation-jobs';

// 第四階段（品牌深度研究已完成、等待最終確認）按「上一步」時，退回第二階段讓使用者修改品牌／大綱
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
      { error: `任務狀態為 ${job.status}，無法退回上一步` },
      { status: 409 }
    );
  }

  const updated = revertToAwaitingConfirm(jobId);
  return NextResponse.json({ jobId, status: updated?.status });
}
