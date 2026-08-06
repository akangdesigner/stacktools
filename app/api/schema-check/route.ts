import { NextRequest, NextResponse } from 'next/server';
import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';
import { extractJsonLd, fetchWithTimeout, fetchSitemapUrls } from '@/lib/site-audit-crawler';
import { evalNode } from '@/lib/site-audit-schema';

// Schema 檢查 API：貼一個網址，自動抓該頁＋同網域內看起來像「聯絡我們/關於我們」的頁面
// （很多站的 LocalBusiness 資料只掛在這類頁面，不在首頁），逐頁跑真實 JSON-LD 抽取＋欄位完整度檢查。
// 找候選頁優先看 sitemap.xml（不受 JS 動態選單影響，stack.com.tw 首頁選單就是 JS 產生、
// 靜態連結掃不到「聯絡我們」，但 sitemap 裡有），首頁連結文字比對當備援。
// 跟 site-audit 共用同一套解析（extractJsonLd）與欄位規則（evalNode）。

const MAX_PAGES = 4; // 首頁 + 最多 3 個自動找到的候選頁
const CONTACT_KEYWORDS = ['contact', '聯絡', '联系', 'about', '關於', '关于', 'location', '門市', '门市', '據點', '据点', 'store', '分店', 'find-us'];

function normalizeInput(u: string): string {
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

// sitemap／連結裡的網址常是 percent-encoded 中文（如 %e8%81%af%e7%b5%a1...），
// 不解碼永遠比對不到「聯絡」這種關鍵字
function decodedPath(u: string): string {
  try {
    return decodeURIComponent(new URL(u).pathname).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function scoreCandidate(path: string, text: string): number {
  return CONTACT_KEYWORDS.reduce((s, kw) => s + (path.includes(kw) || text.includes(kw) ? 1 : 0), 0);
}

// 找看起來像「聯絡我們/關於我們」的同網域頁面：sitemap.xml 優先，首頁連結文字比對當備援
async function findContactLikeCandidates(homeRoot: NHTMLElement, homeUrl: string, origin: string): Promise<string[]> {
  const hits = new Map<string, number>(); // url → 命中關鍵字數（排序用）

  try {
    const sitemapUrls = await fetchSitemapUrls(origin);
    for (const u of sitemapUrls) {
      const score = scoreCandidate(decodedPath(u), '');
      if (score > 0) hits.set(u, Math.max(hits.get(u) ?? 0, score));
    }
  } catch {
    /* sitemap 抓不到就只靠首頁連結 */
  }

  for (const a of homeRoot.querySelectorAll('a[href]')) {
    const raw = (a.getAttribute('href') ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    if (/\/cdn-cgi\//i.test(raw)) continue; // Cloudflare 信箱防爬連結，文字常包住「聯絡我們」但不是真的頁面
    let abs: URL;
    try {
      abs = new URL(raw, homeUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    const key = abs.href.split('#')[0];
    const score = scoreCandidate(decodedPath(key), a.textContent.trim().toLowerCase());
    if (score > 0) hits.set(key, Math.max(hits.get(key) ?? 0, score));
  }

  return [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

async function fetchAndExtract(pageUrl: string) {
  const res = await fetchWithTimeout(pageUrl, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('html')) throw new Error('不是 HTML 頁面');
  const html = await res.text();
  const root = parse(html);
  const { types, nodes } = extractJsonLd(root);
  const evals = nodes.map((node) => ({ node, ...evalNode(node) }));
  return { root, types, evals };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要檢查的網址' }, { status: 400 });

  let homeUrl: string;
  let origin: string;
  try {
    const u = new URL(normalizeInput(input));
    homeUrl = u.href;
    origin = u.origin;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  type FetchResult = Awaited<ReturnType<typeof fetchAndExtract>>;
  type PageResult = { url: string; source: string; types: FetchResult['types']; evals: FetchResult['evals'] };
  let home: FetchResult;
  try {
    home = await fetchAndExtract(homeUrl);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `抓取失敗：${err.message}` : '抓取失敗' }, { status: 400 });
  }
  const results: PageResult[] = [{ url: homeUrl, source: '首頁', types: home.types, evals: home.evals }];

  const candidates = (await findContactLikeCandidates(home.root, homeUrl, origin)).filter((u) => u !== homeUrl).slice(0, MAX_PAGES - 1);
  for (const url of candidates) {
    try {
      const r = await fetchAndExtract(url);
      results.push({ url, source: '自動找到的相關頁', types: r.types, evals: r.evals });
    } catch {
      /* 候選頁是自動找的，抓失敗就略過，不擋主要結果 */
    }
  }

  // 一個候選都沒有：sitemap 也沒有、首頁連結也掃不到，讓前端提示改貼具體頁面網址
  const noCandidatesFound = candidates.length === 0;

  return NextResponse.json({ results, noCandidatesFound });
}
