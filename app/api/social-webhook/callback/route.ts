import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, savePosts } from '@/lib/socialDb';

function detectPlatform(url: string | null): string {
  if (!url) return 'IG';
  if (/instagram\.com/i.test(url)) return 'IG';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YT';
  if (/threads\.net/i.test(url)) return 'Threads';
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/facebook\.com|fb\.com/i.test(url)) return 'FB';
  return 'IG';
}

// N8N 回傳的單筆貼文 — 支援中文欄位名、英文欄位名、Apify 原始欄位名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(p: Record<string, any>) {
  const hashtags =
    p['hashtags'] ?? p['Hashtags'] ?? null;
  const hashtagsStr = Array.isArray(hashtags)
    ? hashtags.map((h) => (h && typeof h === 'object' && 'name' in h ? `#${h.name}` : String(h))).join(' ')
    : typeof hashtags === 'string' ? hashtags : null;

  // post_url：先算出來，供 platform 偵測使用
  const post_url =
    p['貼文網址'] ??
    p['圖影網址'] ??
    p['影片url'] ??
    p['postUrl'] ?? p['post_url'] ??
    p['url'] ?? p[' url'] ??
    null;

  // platform：有明確欄位就用，否則從 URL 自動判斷
  const rawPlatform = p['platform'] ?? p['Platform'] ?? p['平台'] ?? '';
  const platform = rawPlatform || detectPlatform(post_url);

  // account：中文欄位 / 英文欄位 / Apify ownerFullName / ownerUsername / YT 頻道名稱 / 抖音帳號 / FB 貼文擁有者
  // fallback：從 Threads URL 提取 @username
  const accountRaw =
    p['IG帳號'] ??
    p['IG帳號姓名'] ??
    p['抖音帳號'] ??
    p['貼文擁有者'] ??
    p['頻道名稱'] ??
    p['account'] ?? p['Account'] ??
    p['ownerFullName'] ?? p['ownerUsername'] ??
    null;
  const account = accountRaw ?? extractThreadsAccount(post_url);


  // content：中文欄位 / 英文欄位 / Apify caption / Threads text / YT 標題＋描述 / FB 文案
  const content =
    p['貼文內容'] ??
    p['文案'] ??
    p['content'] ?? p['Content'] ??
    p['caption'] ??
    p['text'] ??
    (p['影片標題'] ? `${p['影片標題']}${p['影片描述'] ? '\n\n' + p['影片描述'] : ''}` : null) ??
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

  // profile_pic_url：帳號大頭貼（獨立儲存，不混入貼文縮圖）
  const profile_pic_url = p['大頭貼'] ?? p['大頭照'] ?? p['profilePicUrl'] ?? p['頻道大頭貼'] ?? null;

  // thumbnail：只取貼文圖片，不 fallback 到大頭貼
  const thumbnail =
    p['displayUrl'] ??
    p['thumbnail'] ?? p['Thumbnail'] ??
    null;

  // post_date：中文 / 英文 / Apify timestamp / YT 影片日期
  const post_date =
    p['日期'] ??
    p['影片日期'] ??
    p['postDate'] ?? p['post_date'] ??
    p['timestamp'] ?? p['takenAtTimestamp'] ??
    null;

  const video_url =
    p['videoUrl'] ?? p['video_url'] ?? p['影片網址'] ?? null;

  return { platform, account, post_url, content, likes, comments, views, thumbnail, profile_pic_url, post_date, hashtags: hashtagsStr, video_url };
}

// 從 threads.net URL 提取帳號名稱，例如 https://www.threads.net/@relove_care/post/xxx → @relove_care
function extractThreadsAccount(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/threads\.net\/(@[^/]+)/i);
  return m ? m[1] : null;
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
  // 支援 posts（英文 key）或 貼文（Threads n8n 用中文 key）
  const rawPosts = body['posts'] ?? body['貼文'];

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
