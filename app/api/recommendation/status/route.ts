import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationJob } from '@/lib/recommendation-jobs';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getRecommendationJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  return NextResponse.json(job);
}
