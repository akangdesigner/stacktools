import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';
import { listClients, listArticlePages } from '@/lib/gscDb';

// 部落格改寫 — 列出客戶可改寫的文章清單：
// LIFF 進場先讀取這份清單，讓小編先選一篇（預設最新）、預覽原文，確認後才改寫、也能挑舊文。
// 文章清單存在 GSC 工具的 gsc_article_pages（使用者手動維護的「文章標題＋連結」，type 目前多為空字串＝文章）。
export const dynamic = 'force-dynamic';

// 這些 type 視為「非文章」（產品／分類頁），不列入改寫清單；目前資料多半空字串＝文章，此為未來防呆
const NON_ARTICLE = ['產品', '分類', 'product', 'category'];

export async function POST(req: NextRequest) {
  const { line_uid } = (await req.json()) as { line_uid?: string };
  if (!line_uid || !line_uid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }

  // 1. line_uid → AI 小編客戶（取客戶名稱）
  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }

  // 2. 用客戶名稱模糊比對 GSC 客戶（比照 n8n「匹配客戶」：去空白轉小寫後雙向 includes）
  const target = String(client.name || '').trim().toLowerCase();
  const gsc = listClients().find((c) => {
    const n = String(c.name || '').trim().toLowerCase();
    return n && target && (n.includes(target) || target.includes(n));
  });
  if (!gsc) {
    return NextResponse.json(
      { error: '找不到你的文章清單，請先到「網站技術健檢／GSC」設定文章清單' },
      { status: 404 }
    );
  }

  // 3. 取文章清單 → 濾掉產品／分類頁 → 只留有標題與網址者 → 新到舊（id 越大越新）
  const articles = listArticlePages(gsc.id)
    .filter((p) => {
      const t = String(p.type || '').toLowerCase();
      return !NON_ARTICLE.some((k) => t.includes(k.toLowerCase()));
    })
    .filter((p) => p.url && p.title)
    .sort((a, b) => b.id - a.id)
    .map((p) => ({ id: p.id, title: p.title, url: p.url }));

  return NextResponse.json({ articles, customerName: client.name });
}
