import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, savePosts } from '@/lib/socialDb';

export async function POST(req: NextRequest) {
  let body: {
    jobId?: string;
    status?: string;
    message?: string;
    posts?: {
      platform?: string;
      account?: string;
      postUrl?: string;
      content?: string;
      likes?: number;
      comments?: number;
      views?: number;
      thumbnail?: string;
      postDate?: string;
    }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { jobId, status, message, posts } = body;
  if (!jobId || !status) {
    return NextResponse.json({ error: '缺少 jobId 或 status' }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  if (status === 'completed' && Array.isArray(posts) && posts.length > 0) {
    savePosts(jobId, posts.map((p) => ({
      platform: p.platform ?? '',
      account: p.account,
      post_url: p.postUrl,
      content: p.content,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      thumbnail: p.thumbnail,
      post_date: p.postDate,
    })));
  }

  updateJob(jobId, status as 'completed' | 'failed' | 'processing', message);
  return NextResponse.json({ ok: true });
}
