// 發布到 WordPress（Elementor 格式）
// -----------------------------------------------------------------------------
// 前端把「寫手全文 Markdown」送進來（連線資訊在 .env），這裡：
//   1. 把內文 base64 圖片先上傳到 WP 媒體庫，換成媒體網址（才能做成真正的圖片元件）
//   2. 用 markdownToElementor 把 Markdown 轉成 Elementor JSON（每段獨立元件）
//   3. 打 WP 自訂端點 /wp-json/stacktools/v1/elementor-post（需先在 WP 貼 Code Snippet）
//   4. 回傳 WP 建立的文章 id 與 Elementor 編輯連結
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { markdownToElementor } from '@/lib/md-to-elementor';

// 把 Markdown 裡的 base64 圖片（data URI）上傳到 WP 媒體庫，
// 回傳「換成媒體網址的 Markdown」與「網址 → 媒體庫 ID」對照表。
// 用 WordPress 內建的 REST 端點 /wp-json/wp/v2/media（應用程式密碼即可上傳，不用改 snippet）。
async function uploadDataUriImages(markdown: string, base: string, auth: string) {
  const mediaMap: Record<string, number> = {};
  const re = /!\[[^\]]*\]\((data:(image\/[a-zA-Z0-9.+-]+);base64,([^)]+))\)/g;
  const matches = [...markdown.matchAll(re)];
  let out = markdown;
  let n = 0;

  for (const m of matches) {
    const dataUri = m[1];
    if (mediaMap[dataUri] !== undefined) continue; // 同一張圖只上傳一次
    const mime = m[2];
    const b64 = m[3];
    const ext = mime.split('/')[1].replace('jpeg', 'jpg').split('+')[0]; // svg+xml → svg
    const buffer = Buffer.from(b64, 'base64');
    const filename = `writer-${Date.now()}-${++n}.${ext}`;

    const res = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`圖片上傳媒體庫失敗（HTTP ${res.status}）：${t.slice(0, 200)}`);
    }
    const data = await res.json() as { id: number; source_url: string };
    // 把這張 data URI 全篇換成媒體網址，並記住網址對應的媒體 ID
    out = out.split(dataUri).join(data.source_url);
    mediaMap[data.source_url] = data.id;
  }

  return { markdown: out, mediaMap };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, markdown, status } = body as {
      title?: string;
      markdown?: string;
      status?: string;
    };

    // 校稿站是固定一台，連線資訊放在 .env（WRITER_WP_URL / _USER / _APP_PASSWORD），
    // 前端不用再填。這樣換裝置、換 session 都不會遺失。
    const wpUrl = process.env.WRITER_WP_URL;
    const username = process.env.WRITER_WP_USER;
    const appPassword = process.env.WRITER_WP_APP_PASSWORD;

    // 基本檢查
    if (!wpUrl || !username || !appPassword) {
      return NextResponse.json({ error: '伺服器尚未設定校稿站連線（請在 .env 填 WRITER_WP_URL／WRITER_WP_USER／WRITER_WP_APP_PASSWORD）' }, { status: 500 });
    }
    if (!markdown || !markdown.trim()) {
      return NextResponse.json({ error: '文章內容是空的' }, { status: 400 });
    }

    // 組出目標端點（去掉網址尾端斜線）
    const base = wpUrl.trim().replace(/\/+$/, '');
    const endpoint = `${base}/wp-json/stacktools/v1/elementor-post`;

    // 應用程式密碼 Basic Auth（密碼裡的空格 WP 會自行忽略，這裡原樣帶入即可）
    const auth = Buffer.from(`${username.trim()}:${appPassword.trim()}`).toString('base64');

    // 先把 base64 圖片上傳媒體庫，換成網址（這樣才能做成真正的圖片元件而非塞進文字）
    const { markdown: resolvedMarkdown, mediaMap } = await uploadDataUriImages(markdown, base, auth);

    // Markdown → Elementor JSON（圖片獨立成 image 元件）
    const elementorData = markdownToElementor(resolvedMarkdown, mediaMap);
    if (elementorData.length === 0) {
      return NextResponse.json({ error: '文章解析後沒有任何段落' }, { status: 400 });
    }

    const wpRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        title: title?.trim() || '未命名文章',
        status: status === 'publish' ? 'publish' : 'draft',
        elementor_data: elementorData,
      }),
    });

    // WP 可能回非 JSON（例如被安全外掛擋、404），先取文字再嘗試解析
    const text = await wpRes.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `WP 回應非預期格式（HTTP ${wpRes.status}）：${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    if (!wpRes.ok) {
      const msg = (data as { message?: string })?.message || `WP 回應錯誤（HTTP ${wpRes.status}）`;
      return NextResponse.json({ error: msg }, { status: wpRes.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: `發布失敗：${msg}` }, { status: 500 });
  }
}
