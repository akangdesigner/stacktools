import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';

// ── 網站技術健檢：全站爬蟲層 ────────────────────────────
// 從首頁 BFS 爬「第一～第二層」、上限 300 頁，逐頁擷取分析要用的原始事實（title/desc、h 標籤、
// 圖片 ALT、JSON-LD、canonical、robots、viewport、GA 碼、內外部連結）。
// 另外抓 sitemap.xml（給孤島比對）與 robots.txt / llms.txt（站台檔案存在性）。
// 這一層只負責「爬 + 擷取原始值」，判斷門檻（title ≤30 等）交給 site-audit-aggregate.ts。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

// 單頁擷取到的原始事實（數值，不含判斷）
export interface PageFacts {
  url: string;
  depth: number;         // 距首頁的層數（0=首頁）
  ok: boolean;           // HTTP < 400
  status: number;
  title: string;
  description: string;
  h1: number;
  h2: number;
  imgTotal: number;      // 需檢查的圖（已排除裝飾圖）
  imgAltEmpty: number;
  imgAltEmptyNames: string[];
  imgLegacy: number;     // 非 WebP/AVIF 的圖數
  jsonLdTypes: string[];
  hasBreadcrumb: boolean;
  canonical: string;
  noindex: boolean;
  hasViewport: boolean;
  analytics: string[];   // 這頁找到的追蹤碼（GA4/UA/GTM/GSC）
  internalLinks: string[]; // 正規化後的同網域連結
  externalCount: number;
  isHome: boolean;
  mainText: string;      // 純文字摘要（給 E-E-A-T 取樣用，截斷）
}

export interface CrawlProgress {
  crawled: number;
  discovered: number;
  cap: number;
}

export interface CrawlResult {
  origin: string;
  pages: PageFacts[];
  sitemapUrls: string[];
  sitemapExists: boolean;
  robotsExists: boolean;
  llmsExists: boolean;
  reachedCap: boolean;   // 是否碰到 300 頁上限（代表可能沒爬完整站）
}

// 網址正規化：同網域比對用，去掉 fragment / 查詢字串 / 結尾斜線（首頁保留 /）
export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    let p = x.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return x.origin + p;
  } catch {
    return u;
  }
}

// 這個 href 值該不該爬（跳過錨點、mailto、tel、js、以及圖檔/文件等非 HTML 資源）
function isCrawlableHref(raw: string): boolean {
  if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|ico|pdf|zip|rar|mp4|mp3|css|js|xml|json|doc|docx|xls|xlsx)(\?|$)/i.test(raw)) return false;
  // Cloudflare 信箱防爬連結（/cdn-cgi/l/email-protection）本來就會 404，不是真壞連結，排除避免假陽性
  if (/\/cdn-cgi\//i.test(raw)) return false;
  return true;
}

// 從 root 抓所有 JSON-LD 的 @type（含巢狀 @graph）
function extractJsonLdTypes(root: NHTMLElement): string[] {
  const types = new Set<string>();
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const text = script.rawText?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const nodes: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { '@graph'?: unknown[] })['@graph'])
          ? (data as { '@graph': unknown[] })['@graph']
          : [data];
      for (const node of nodes) {
        const t = (node as { '@type'?: unknown })?.['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
      }
    } catch {
      /* 解析失敗略過 */
    }
  }
  return [...types];
}

// 擷取單頁事實
function extractPageFacts(html: string, url: string, depth: number, status: number, ok: boolean, origin: string): PageFacts {
  const root = parse(html);
  const title = (root.querySelector('title')?.textContent ?? '').trim();
  const description = (root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '').trim();

  // 圖片：排除裝飾圖後統計 alt 空白 / 非現代格式
  const imgs = root.querySelectorAll('img').filter((img) => {
    const role = (img.getAttribute('role') ?? '').toLowerCase();
    return role !== 'presentation' && img.getAttribute('aria-hidden') !== 'true';
  });
  const emptyImgs = imgs.filter((img) => !(img.getAttribute('alt') ?? '').trim());
  const imgAltEmptyNames = [
    ...new Set(
      emptyImgs
        .map((img) => (img.getAttribute('src') || img.getAttribute('data-src') || '').split('?')[0].split('/').pop() || '')
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const legacy = imgs.filter((img) => {
    const src = (img.getAttribute('src') ?? '').split('?')[0].toLowerCase();
    return src && !/\.(webp|avif)$/.test(src);
  }).length;

  const jsonLdTypes = extractJsonLdTypes(root);
  const hasBreadcrumb =
    jsonLdTypes.includes('BreadcrumbList') ||
    !!root.querySelector('nav[aria-label*="breadcrumb" i], nav[class*="breadcrumb" i], [class*="breadcrumb" i]');

  const robots = (root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '').toLowerCase();
  const googlebot = (root.querySelector('meta[name="googlebot"]')?.getAttribute('content') ?? '').toLowerCase();

  const analytics: string[] = [];
  if (/G-[A-Z0-9]{6,}/.test(html)) analytics.push('GA4');
  if (/UA-\d{4,}-\d+/.test(html)) analytics.push('Universal Analytics');
  if (/GTM-[A-Z0-9]+/.test(html)) analytics.push('GTM');
  if (root.querySelector('meta[name="google-site-verification"]')) analytics.push('GSC 驗證碼');

  // 內外部連結
  const internal = new Set<string>();
  let externalCount = 0;
  for (const a of root.querySelectorAll('a[href]')) {
    const raw = (a.getAttribute('href') ?? '').trim();
    if (!isCrawlableHref(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, url);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.origin === origin) internal.add(normalizeUrl(abs.href));
    else externalCount++;
  }

  // 純文字摘要（去 script/style，截斷）
  const bodyClone = parse((root.querySelector('body') ?? root).outerHTML);
  bodyClone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  const mainText = bodyClone.textContent.replace(/\s+/g, ' ').trim().slice(0, 2000);

  let pathname = '/';
  try {
    pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    /* 用預設 */
  }

  return {
    url,
    depth,
    ok,
    status,
    title,
    description,
    h1: root.querySelectorAll('h1').length,
    h2: root.querySelectorAll('h2').length,
    imgTotal: imgs.length,
    imgAltEmpty: emptyImgs.length,
    imgAltEmptyNames,
    imgLegacy: legacy,
    jsonLdTypes,
    hasBreadcrumb,
    canonical: (root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim(),
    noindex: /noindex/.test(robots) || /noindex/.test(googlebot),
    hasViewport: !!(root.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').trim(),
    analytics,
    internalLinks: [...internal],
    externalCount,
    isHome: pathname === '/',
    mainText,
  };
}

// 抓 sitemap.xml，解析出所有頁面網址（支援 sitemapindex 巢狀，最多抓 30 份、2000 個網址）
async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [`${origin}/sitemap.xml`];
  const out = new Set<string>();
  let fetched = 0;
  while (queue.length && out.size < 2000 && fetched < 30) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    fetched++;
    try {
      const res = await fetchWithTimeout(sm, 10000);
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      const isIndex = /<sitemapindex/i.test(xml);
      for (const loc of locs) {
        if (isIndex) queue.push(loc.trim());
        // 存「原始」網址（保留結尾斜線/查詢字串）：GSC URL 檢測要用 Google 實際收錄的原網址，
        // 正規化（去斜線）會讓 Google 回「無法辨識的網址」。孤島比對時才另外做正規化。
        else out.add(loc.trim());
      }
    } catch {
      /* 單份 sitemap 抓失敗就跳過 */
    }
  }
  return [...out];
}

// 站台檔案是否存在
async function fileExists(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    return res.ok;
  } catch {
    return false;
  }
}

// 全站爬取主入口：BFS 第一～二層、上限 maxPages 頁
export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; maxDepth?: number; concurrency?: number; onProgress?: (p: CrawlProgress) => void } = {},
): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 300;
  const maxDepth = opts.maxDepth ?? 2;
  const concurrency = opts.concurrency ?? 8;

  const origin = new URL(startUrl).origin;
  const home = `${origin}/`;

  // 站台檔案 + sitemap 先並行抓（與爬站同時進行）
  const sidePromise = Promise.all([
    fetchSitemapUrls(origin),
    fileExists(`${origin}/sitemap.xml`),
    fileExists(`${origin}/robots.txt`),
    fileExists(`${origin}/llms.txt`),
  ]);

  const seen = new Set<string>([normalizeUrl(home)]);
  let frontier: { url: string; depth: number }[] = [{ url: home, depth: 0 }];
  const pages: PageFacts[] = [];
  let reachedCap = false;

  while (frontier.length && pages.length < maxPages) {
    const nextFrontier: { url: string; depth: number }[] = [];
    // 這一層的頁面分批並行抓（每批 concurrency 個）
    for (let i = 0; i < frontier.length && pages.length < maxPages; i += concurrency) {
      const remaining = maxPages - pages.length;
      const batch = frontier.slice(i, i + concurrency).slice(0, remaining);
      const facts = await Promise.all(
        batch.map(async ({ url, depth }) => {
          try {
            const res = await fetchWithTimeout(url);
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('html')) {
              // 非 HTML（可能被導向檔案）：只記狀態，不擷取
              return emptyFacts(url, depth, res.status, res.ok, origin);
            }
            return extractPageFacts(await res.text(), url, depth, res.status, res.ok, origin);
          } catch {
            return emptyFacts(url, depth, 0, false, origin);
          }
        }),
      );
      for (const f of facts) {
        pages.push(f);
        opts.onProgress?.({ crawled: pages.length, discovered: seen.size, cap: maxPages });
        // 還沒到最大層數才往下擴展
        if (f.depth < maxDepth) {
          for (const link of f.internalLinks) {
            const n = normalizeUrl(link);
            if (seen.has(n)) continue;
            if (seen.size >= maxPages) {
              reachedCap = true;
              continue;
            }
            seen.add(n);
            nextFrontier.push({ url: n, depth: f.depth + 1 });
          }
        }
      }
    }
    frontier = nextFrontier;
  }
  if (seen.size >= maxPages) reachedCap = true;

  const [sitemapUrls, sitemapExists, robotsExists, llmsExists] = await sidePromise;
  return { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap };
}

// 非 HTML / 連不上頁面的空事實
function emptyFacts(url: string, depth: number, status: number, ok: boolean, origin: string): PageFacts {
  let isHome = false;
  try {
    isHome = (new URL(url).pathname.replace(/\/+$/, '') || '/') === '/';
  } catch {
    /* 忽略 */
  }
  return {
    url, depth, ok, status,
    title: '', description: '', h1: 0, h2: 0,
    imgTotal: 0, imgAltEmpty: 0, imgAltEmptyNames: [], imgLegacy: 0,
    jsonLdTypes: [], hasBreadcrumb: false, canonical: '', noindex: false, hasViewport: false,
    analytics: [], internalLinks: [], externalCount: 0, isHome, mainText: '',
  };
}
