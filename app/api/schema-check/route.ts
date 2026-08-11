import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'node-html-parser';
import { extractJsonLd, fetchRenderedHtml, fetchWithTimeout } from '@/lib/site-audit-crawler';
import { evalNode } from '@/lib/site-audit-schema';

// Schema 檢查 API：貼一個網址，查首頁真實部署的 JSON-LD，逐節點做欄位完整度檢查。
// 在地商家/組織品牌/商品/文章 schema 幾乎都是全站共用同一份，查首頁就等於查全站，不用整站爬取。

function normalizeInput(u: string): string {
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

async function fetchAndExtractExtra(pageUrl: string) {
  const res = await fetchWithTimeout(pageUrl, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('html')) throw new Error('不是 HTML 頁面');
  const html = await res.text();
  const root = parse(html);
  return extractJsonLd(root);
}

// 固定用 jsdom 真的執行一次頁面 JS 再讀 DOM——SHOPLINE 等平台常把商家 schema 用前端 JS 動態插入
// DOM，伺服器端原始碼裡完全沒有；純 fetch 抓到的節點只是 JS 執行後結果的子集（原本就在原始碼裡
// 的 script 不會因為執行 JS 而消失），改用渲染版不會漏掉伺服器端就有的 schema。
//
// 實測發現同一個網址、不同次執行，JS 注入完成的時間點會飄動（客戶站第三方腳本載入時間本來就受
// 當下網路狀況影響），單跑一次渲染有機率剛好卡到還沒注入完成。渲染結果沒有比純 fetch 多抓到型別
// 時，很可能就是踩到這種情況，值得再試一次，最多試 2 次——2 次都沒有比純 fetch 多，才視為這個網站
// 真的沒有 JS 注入的 schema，不是我們沒抓到。
async function fetchAndExtractHome(pageUrl: string) {
  const plain = await fetchAndExtractExtra(pageUrl).catch(() => null);

  let best: ReturnType<typeof extractJsonLd> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = await fetchRenderedHtml(pageUrl);
    if (!html) continue;
    const extracted = extractJsonLd(parse(html));
    if (!best || extracted.types.length > best.types.length) best = extracted;
    if (best.types.length > (plain?.types.length ?? 0)) break; // 已經比純 fetch 多抓到東西，不用再試
  }

  if (best && best.types.length > 0) return { ...best, rendered: true };
  if (plain) return { ...plain, rendered: false };
  throw new Error('網站沒有回應或無法連線');
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要檢查的網址' }, { status: 400 });

  let homeUrl: string;
  try {
    homeUrl = new URL(normalizeInput(input)).href;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  try {
    const { types, nodes, rendered } = await fetchAndExtractHome(homeUrl);
    const evals = nodes.map((node) => ({ node, ...evalNode(node) }));
    const results = [{ url: homeUrl, source: rendered ? '首頁（JS 渲染後補抓）' : '首頁', types, evals }];
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `抓取失敗：${err.message}` : '抓取失敗' }, { status: 400 });
  }
}
