import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, savePosts } from '@/lib/socialDb';

// 從 Threads short code 提取發文時間（Instagram media ID 結構：高位 bits 含時間戳）
function extractDateFromThreadsCode(code: string): string | null {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const EPOCH = BigInt(1314220021721);
  let id = BigInt(0);
  for (const ch of code) {
    const v = CHARS.indexOf(ch);
    if (v < 0) return null;
    id = id * BigInt(64) + BigInt(v);
  }
  const ts = Number((id >> BigInt(23)) + EPOCH);
  return new Date(ts).toISOString();
}

// 從 URL 推測平台，辨識不出回傳 null（不預設 IG）
function detectPlatformFromUrl(url: string | null): string | null {
  if (!url) return null;
  if (/instagram\.com/i.test(url)) return 'IG';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YT';
  if (/threads\.net/i.test(url)) return 'Threads';
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/facebook\.com|fb\.com/i.test(url)) return 'FB';
  return null;
}

// N8N 回傳的單筆貼文 — 支援中文欄位名、英文欄位名、Apify 原始欄位名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePost(p: Record<string, any>, sourcePlatform?: string) {
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

  // platform：優先用外層 sourcePlatform（頻道來源），其次貼文本身欄位，最後從 URL 偵測
  // 三者都無法辨識則回傳 null，由呼叫端過濾丟棄
  const rawPlatform = p['platform'] ?? p['Platform'] ?? p['平台'] ?? '';
  const platform = sourcePlatform || rawPlatform || detectPlatformFromUrl(post_url);
  if (!platform) return null;

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
  // Threads 新格式：caption.text（影片貼文）或 text_post_app_info.text_fragments.fragments[0].plaintext（圖文貼文）
  const threadsNewText =
    (p['caption'] && typeof p['caption'] === 'object' ? p['caption']['text'] : null) ??
    (p['text_post_app_info']?.['text_fragments']?.['fragments']?.[0]?.['plaintext'] ?? null);
  const content =
    p['貼文內容'] ??
    p['文案'] ??
    p['content'] ?? p['Content'] ??
    threadsNewText ??
    (typeof p['caption'] === 'string' ? p['caption'] : null) ??
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

  // views：中文 / 英文 / Apify videoPlayCount / videoViewCount / FB viewsCount
  const views = toInt(
    p['觀看數'] ?? p['viewsCount'] ?? p['views'] ?? p['Views'] ??
    p['videoPlayCount'] ?? p['videoViewCount']
  );

  // profile_pic_url：帳號大頭貼（獨立儲存，不混入貼文縮圖）
  const profile_pic_url = p['大頭貼'] ?? p['大頭照'] ?? p['profilePicUrl'] ?? p['頻道大頭貼'] ?? null;

  // thumbnail：只取貼文圖片，不 fallback 到大頭貼
  // Threads 新格式：image_versions2.candidates[0].url
  const thumbnail =
    p['displayUrl'] ??
    p['thumbnail'] ?? p['Thumbnail'] ??
    (p['image_versions2']?.['candidates']?.[0]?.['url'] ?? null);

  // post_date：中文 / 英文 / Apify timestamp / YT 影片日期，統一轉為 ISO 字串
  let post_date = normalizeDate(
    p['貼文時間'] ??
    p['日期'] ??
    p['影片日期'] ??
    p['postDate'] ?? p['post_date'] ??
    p['timestamp'] ?? p['takenAtTimestamp'] ??
    null
  );
  // Threads 且沒有日期時，從 short code 提取時間戳
  if (!post_date && platform === 'Threads' && post_url) {
    const m = post_url.match(/threads\.net\/(?:@[^/]+\/post\/|t\/)([^/?#]+)/);
    if (m) post_date = extractDateFromThreadsCode(m[1]);
  }

  const video_url =
    p['videoUrl'] ?? p['video_url'] ?? p['影片網址'] ??
    (p['video_versions']?.[0]?.['url'] ?? null);

  // is_video：FB 明確回傳 true/false，其他平台保持 null
  // FB 且明確為非影片 → 不匯入
  const isVideoRaw = p['是否有影片'];
  if (platform === 'FB' && isVideoRaw === false) return null;
  const is_video = isVideoRaw === true ? 1 : null;

  return { platform, account, post_url, content, likes, comments, views, thumbnail, profile_pic_url, post_date, hashtags: hashtagsStr, video_url, is_video };
}

// 從 threads.net URL 提取帳號名稱，例如 https://www.threads.net/@relove_care/post/xxx → @relove_care
function extractThreadsAccount(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/threads\.net\/(@[^/]+)/i);
  return m ? m[1] : null;
}

// 統一把各種日期格式轉成 ISO 字串（YYYY-MM-DDTHH:mm:ss.sssZ）
// 支援：Unix 10/13 位數字、2026/2/26、ISO 字串
function normalizeDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Unix timestamp（秒 or 毫秒）
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
  // YYYY/MM/DD 或 YYYY-MM-DD（可帶時間）
  const normalized = s.replace(/\//g, '-');
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
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
  // Threads replies：與 貼文 平行的圖片陣列，replies[i].images[0] 為 貼文[i] 的縮圖
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawReplies: Array<{ images?: string[] } | null> = Array.isArray(body['replies']) ? body['replies'] : [];
  // 外層平台來源，將 n8n 頻道來源名稱對應到內部標準名稱
  const platformMap: Record<string, string> = {
    facebook: 'FB', instagram: 'IG', threads: 'Threads', tiktok: 'TikTok', youtube: 'YT',
  };
  const sourcePlatform: string | undefined = body['頻道來源']
    ? (platformMap[String(body['頻道來源']).toLowerCase()] ?? String(body['頻道來源']))
    : undefined;

  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  if (Array.isArray(rawPosts) && rawPosts.length > 0) {
    // 展開巢狀結構：若 item 內有 "貼文" 陣列（Threads 格式），則拆成多筆
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flatPosts: Array<{ post: Record<string, any>; platform: string | undefined }> = [];
    for (const item of rawPosts) {
      const itemPlatform = item['頻道來源']
        ? (platformMap[String(item['頻道來源']).toLowerCase()] ?? String(item['頻道來源']))
        : sourcePlatform;
      // 第N篇貼文的code 格式：直接展開成多筆 post（只靠 embed 顯示）
      const codeKeys = Object.keys(item).filter(k => /篇貼文的code$/.test(k));
      if (codeKeys.length > 0) {
        codeKeys.sort();
        for (const key of codeKeys) {
          const code = String(item[key] ?? '').trim();
          if (!code) continue;
          flatPosts.push({
            post: {
              貼文擁有者: item['貼文擁有者'] ?? null,
              大頭照: item['大頭照'] ?? item['大頭貼'] ?? null,
              post_url: `https://www.threads.net/t/${code}`,
            },
            platform: itemPlatform,
          });
        }
        continue;
      }

      const subPostsArray = item['貼文'] ?? item['latestPosts'];
      if (Array.isArray(subPostsArray)) {
        // 每個 item 包含多筆子貼文，過濾 null，並把外層帳號資訊帶入
        // 舊格式：replies[i].images[0] 與 貼文[i] 平行對應，作為縮圖
        for (let i = 0; i < subPostsArray.length; i++) {
          const sub = subPostsArray[i];
          if (sub == null) continue;
          const replyThumbnail = rawReplies[i]?.images?.[0] ?? null;
          const merged = {
            ...sub,
            大頭照: sub['大頭照'] ?? sub['大頭貼'] ?? item['大頭照'] ?? item['大頭貼'] ?? null,
            貼文擁有者: sub['貼文擁有者'] ?? item['貼文擁有者'] ?? null,
            thumbnail: sub['thumbnail'] ?? replyThumbnail,
          };
          flatPosts.push({ post: merged, platform: itemPlatform });
        }
      } else {
        flatPosts.push({ post: item, platform: itemPlatform });
      }
    }
    const normalized = flatPosts.map(({ post, platform }) => normalizePost(post, platform)).filter((p) => p !== null);
    if (normalized.length > 0) savePosts(jobId, normalized);
  }

  updateJob(jobId, status as 'completed' | 'failed' | 'processing', message ?? undefined);
  return NextResponse.json({ ok: true });
}
