import { NextRequest, NextResponse } from 'next/server';

// 部落格改寫 — 預覽單篇原文（不改寫）：
// 給一個文章網址，抓回「標題＋og 圖＋內文摘要」，讓小編確認要不要改這篇，確認後才進改寫。
// 解析邏輯比照 n8n「抓最新文章1」：og:image / og:title / 從第一個 <h1> 後去標籤取純文字。
export const dynamic = 'force-dynamic';

const SUMMARY_LEN = 220; // 摘要字數上限（預覽判斷用，夠看出是哪篇即可）

export async function POST(req: NextRequest) {
  const { url } = (await req.json()) as { url?: string };
  if (!url || !url.trim()) {
    return NextResponse.json({ error: '缺少文章網址' }, { status: 400 });
  }

  try {
    const res = await fetch(url.trim(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StackToolsBot/1.0)' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `抓取原文失敗（${res.status}）` }, { status: 502 });
    }
    const html = await res.text();

    // og:image（有的話 encodeURI 防中文路徑壞掉）
    const imageMatch = html.match(/<meta[^>]*(?:property|name)="og:image"[^>]*content="([^"]*)"/i);
    let imageUrl = imageMatch ? imageMatch[1].trim() : '';
    if (imageUrl) imageUrl = encodeURI(imageUrl);

    // 標題：優先 og:title，沒有退回 <title>
    const ogTitleMatch = html.match(/<meta[^>]*(?:property|name)="og:title"[^>]*content="([^"]*)"/i);
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = (ogTitleMatch ? ogTitleMatch[1] : titleTagMatch ? titleTagMatch[1] : '').trim();

    // 內文：從第一個 <h1> 之後取，去掉 script/style/頁首頁尾等，再去標籤成純文字
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let bodyHtml = html;
    if (h1Match) {
      const idx = html.indexOf(h1Match[0]);
      bodyHtml = html.substring(idx + h1Match[0].length);
    }
    const text = bodyHtml
      .replace(/<(script|style|header|footer|nav|aside|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|h[1-6]|br|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    const summary = text.length > SUMMARY_LEN ? text.slice(0, SUMMARY_LEN) + '…' : text;

    return NextResponse.json({ title, imageUrl, summary });
  } catch (err) {
    return NextResponse.json({ error: `抓取原文連線失敗：${String(err)}` }, { status: 504 });
  }
}
