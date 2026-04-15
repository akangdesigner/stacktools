import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, savePosts } from '@/lib/socialDb';

// N8N 回傳的單筆貼文 — 支援中文欄位名、英文欄位名、Apify 原始欄位名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(p: Record<string, any>) {
  const hashtags =
    p['hashtags'] ?? p['Hashtags'] ?? null;
  const hashtagsStr = Array.isArray(hashtags)
    ? hashtags.join(' ')
    : typeof hashtags === 'string' ? hashtags : null;

  // platform：空字串也當作未設定，預設 IG
  const rawPlatform = p['platform'] ?? p['Platform'] ?? p['平台'] ?? '';
  const platform = rawPlatform || 'IG';

  // account：中文欄位 / 英文欄位 / Apify ownerFullName / ownerUsername
  const account =
    p['IG帳號姓名'] ??
    p['account'] ?? p['Account'] ??
    p['ownerFullName'] ?? p['ownerUsername'] ??
    null;

  // post_url：中文欄位 / 英文欄位 / Apify url
  const post_url =
    p['貼文網址'] ??
    p['postUrl'] ?? p['post_url'] ??
    p['url'] ??
    null;

  // content：中文欄位 / 英文欄位 / Apify caption
  const content =
    p['貼文內容'] ??
    p['content'] ?? p['Content'] ??
    p['caption'] ??
    null;

  // likes：中文 / 英文 / Apify likesCount
  const likes = toInt(
    p['愛心數'] ?? p['likes'] ?? p['Likes'] ?? p['likesCount'] ?? p['likesAndViewsCount']
  );

  // comments：中文 / 英文 / Apify commentsCount
  const comments = toInt(
    p['留言數'] ?? p['comments'] ?? p['Comments'] ?? p['commentsCount']
  );

  // views：中文 / 英文 / Apify videoPlayCount / videoViewCount
  const views = toInt(
    p['觀看數'] ?? p['views'] ?? p['Views'] ??
    p['videoPlayCount'] ?? p['videoViewCount'] ?? p['videoPlayCount']
  );

  // thumbnail：中文 / 英文 / Apify profilePicUrl / displayUrl
  const thumbnail =
    p['大頭貼'] ??
    p['thumbnail'] ?? p['Thumbnail'] ??
    p['profilePicUrl'] ?? p['displayUrl'] ??
    null;

  // post_date：中文 / 英文 / Apify timestamp
  const post_date =
    p['日期'] ??
    p['postDate'] ?? p['post_date'] ??
    p['timestamp'] ?? p['takenAtTimestamp'] ??
    null;

  const video_url =
    p['videoUrl'] ?? p['video_url'] ?? p['影片網址'] ?? null;

  return { platform, account, post_url, content, likes, comments, views, thumbnail, post_date, hashtags: hashtagsStr, video_url };
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
