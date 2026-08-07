import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'node-html-parser';
import { crawlSite, extractJsonLd, fetchWithTimeout, normalizeUrl } from '@/lib/site-audit-crawler';
import { fetchPageSearchStats } from '@/lib/site-audit-gsc';
import { evalNode } from '@/lib/site-audit-schema';

// Schema 檢查 API：貼一個網址，用跟網站技術健檢同一套 BFS 爬蟲（首頁 2 層內連結 + sitemap 補爬）
// 撈一批頁面，再疊上 GSC 有曝光的頁面（如果這個網域有連結使用者的 GSC 帳號），逐頁做真實 JSON-LD
// 抽取＋欄位完整度檢查。比只挑「聯絡我們」候選頁廣很多，才撈得到 Product/Article 這類分散在
// 各頁的 schema，不是只有全站共用的 Organization/LocalBusiness。

// BFS + sitemap 補爬的頁數上限。實測 stack.com.tw：50 頁要價 77 秒，25 頁 35 秒——
// 這支是同步等結果的 API（不是背景 job），怕撞 Cloudflare 反代的 100 秒逾時，抓保守一點
const MAX_CRAWL_PAGES = 25;
const MAX_GSC_EXTRA = 15; // GSC 有曝光、但爬蟲沒抓到的頁面，額外補抓上限（依曝光排序取前幾個）

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

  type PageResult = { url: string; source: string; types: string[]; evals: ReturnType<typeof buildEvals> };
  function buildEvals(nodes: Record<string, unknown>[]) {
    return nodes.map((node) => ({ node, ...evalNode(node) }));
  }

  let crawl;
  try {
    crawl = await crawlSite(homeUrl, { maxPages: MAX_CRAWL_PAGES, maxDepth: 2 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `抓取失敗：${err.message}` : '抓取失敗' }, { status: 400 });
  }
  if (crawl.pages.length === 0 || !crawl.pages.some((p) => p.ok)) {
    return NextResponse.json({ error: '抓取失敗：網站沒有回應或無法連線' }, { status: 400 });
  }

  const results: PageResult[] = crawl.pages
    .filter((p) => p.ok)
    .map((p) => ({
      url: p.url,
      source: p.isHome ? '首頁' : p.viaSitemap ? 'Sitemap 補爬頁面' : '爬蟲找到的頁面',
      types: p.jsonLdTypes,
      evals: buildEvals(p.jsonLdNodes),
    }));

  // GSC 有實際曝光、但爬蟲沒抓到的頁面（依曝光排序取前幾個）額外補抓一次；這個網域沒連結
  // 使用者的 GSC 帳號時 property 會是 null，靜默略過不報錯，不影響爬蟲抓到的結果
  let gscChecked = false;
  try {
    const { property, stats } = await fetchPageSearchStats(origin);
    if (property) {
      gscChecked = true;
      const covered = new Set(crawl.pages.map((p) => normalizeUrl(p.url)));
      const extraUrls = [...stats.entries()]
        .filter(([url]) => !covered.has(url))
        .sort((a, b) => b[1].impressions - a[1].impressions)
        .slice(0, MAX_GSC_EXTRA)
        .map(([url]) => url);
      const extras = await Promise.all(
        extraUrls.map(async (url) => {
          try {
            const { types, nodes } = await fetchAndExtractExtra(url);
            return { url, source: 'GSC 有曝光的頁面', types, evals: buildEvals(nodes) } as PageResult;
          } catch {
            return null;
          }
        }),
      );
      for (const e of extras) if (e) results.push(e);
    }
  } catch {
    /* GSC 查詢失敗不擋主要結果，退回純爬蟲 */
  }

  // 只有首頁一頁：代表沒有其他站內連結、sitemap 也沒有補到，且沒有 GSC 資料可用
  const onlyHomePage = results.length <= 1;

  return NextResponse.json({ results, onlyHomePage, gscChecked, reachedCap: crawl.reachedCap });
}
