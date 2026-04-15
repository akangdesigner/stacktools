import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, savePosts } from '@/lib/socialDb';

// N8N 回傳的單筆貼文可能是中文欄位名或英文欄位名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(p: Record<string, any>) {
  // 中文欄位（N8N 定義欄位輸出）優先，英文欄位作為備援
  const hashtags = p['hashtags'] ?? p['Hashtags'] ?? null;
  const hashtagsStr = Array.isArray(hashtags)
    ? hashtags.join(' ')
    : typeof hashtags === 'string' ? hashtags : null;

  return {
    platform: p['platform'] ?? p['Platform'] ?? p['平台'] ?? 'IG',
    account:  p['IG帳號姓名'] ?? p['account'] ?? p['Account'] ?? null,
    post_url: p['貼文網址'] ?? p['postUrl'] ?? p['post_url'] ?? null,
    content:  p['貼文內容'] ?? p['content'] ?? p['Content'] ?? null,
    likes:    toInt(p['愛心數'] ?? p['likes'] ?? p['Likes']),
    comments: toInt(p['留言數'] ?? p['comments'] ?? p['Comments']),
    views:    toInt(p['觀看數'] ?? p['views'] ?? p['Views']),
    thumbnail: p['大頭貼'] ?? p['thumbnail'] ?? p['Thumbnail'] ?? null,
    post_date: p['日期'] ?? p['postDate'] ?? p['post_date'] ?? null,
    hashtags: hashtagsStr,
  };
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.round(n);
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const jobId  = body['jobId']  ?? body['job_id'];
  const status = body['status'] ?? 'completed';
  const message = body['message'] ?? null;
  const rawPosts = body['posts'];

  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  if (status === 'completed' && Array.isArray(rawPosts) && rawPosts.length > 0) {
    savePosts(jobId, rawPosts.map(normalizePost));
  }

  updateJob(jobId, status as 'completed' | 'failed' | 'processing', message ?? undefined);
  return NextResponse.json({ ok: true });
}
