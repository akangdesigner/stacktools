import { NextRequest, NextResponse } from 'next/server';
import { getClient, listJobsByClient, getPostsByJob } from '@/lib/socialDb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getClient(id)) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const jobs = listJobsByClient(id);
  const result = jobs.map((job) => ({
    ...job,
    posts: job.status === 'completed' ? getPostsByJob(job.id) : [],
  }));
  return NextResponse.json(result);
}
