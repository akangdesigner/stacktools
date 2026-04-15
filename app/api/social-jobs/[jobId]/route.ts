import { NextRequest, NextResponse } from 'next/server';
import { getJob, getPostsByJob } from '@/lib/socialDb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: '找不到任務' }, { status: 404 });

  const posts = job.status === 'completed' ? getPostsByJob(jobId) : [];
  return NextResponse.json({ ...job, posts });
}
