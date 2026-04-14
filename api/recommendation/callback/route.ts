import { NextRequest, NextResponse } from 'next/server';
import { updateRecommendationJob } from '@/lib/recommendation-jobs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobId = body?.jobId as string | undefined;
  const status = body?.status as "completed" | "failed" | undefined;
  const message = (body?.message as string | undefined) || '';

  if (!jobId || !status) {
    return NextResponse.json({ error: '缺少 jobId 或 status' }, { status: 400 });
  }

  const nextMessage =
    message ||
    (status === 'completed'
      ? '文章已生成完成，請前往 WordPress 後台查看。'
      : '文章生成失敗，請稍後重試或檢查流程設定。');

  const updated = updateRecommendationJob(jobId, status, nextMessage);
  if (!updated) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
