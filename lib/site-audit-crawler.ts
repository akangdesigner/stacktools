import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import path from 'node:path';

// ── 網站技術健檢：全站爬蟲層 ────────────────────────────
// 從首頁 BFS 爬「第一～第二層」＋補爬 sitemap、上限由呼叫端指定（route 目前 1000），逐頁擷取分析要用的原始事實（title/desc、h 標籤、
// 圖片 ALT、JSON-LD、canonical、robots、viewport、GA 碼、內外部連結）。
// 另外抓 sitemap.xml（給孤島比對）與 robots.txt / llms.txt（站台檔案存在性）。
// 這一層只負責「爬 + 擷取原始值」，判斷門檻（title ≤30 等）交給 site-audit-aggregate.ts。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
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

// 有些平台（SHOPLINE 等）的 JSON-LD 是前端 JS 執行後才動態插入 DOM，伺服器端原始碼裡完全沒有，
// 純 fetch（上面的 fetchWithTimeout）抓不到，要真的執行一次頁面 JS 才看得到。只在 schema-check 查
// 首頁時用（見 app/api/schema-check/route.ts），不要套用在整站爬取——執行客戶站不受控的第三方 JS
// 一頁要跑好幾秒，範圍要收斂。
//
// 實測跑過 in-process 用 jsdom 執行（不開子行程），同一個網址兩次結果不一樣：一次 6 秒跑完，
// 一次卡超過 2 分鐘、連加的逾時保險絲都沒攔住。原因是客戶站第三方腳本（客服外掛/recaptcha）常用
// 「同步等待」寫法呼叫外部伺服器，JS 單一執行緒卡住時，連我們自己寫的計時器都排不進事件迴圈、
// 攔不住。改成獨立子行程跑，逾時直接送 SIGKILL——作業系統層級砍行程，不用等卡住的那條線自己讓步。
export async function fetchRenderedHtml(url: string, timeoutMs = 25000): Promise<string | null> {
  const workerPath = path.join(process.cwd(), 'scripts', 'render-jsonld.cjs');
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [workerPath, url], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL'); // 卡在客戶站哪個同步操作都殺得掉，不用等它自己結束
      finish(null);
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      size += d.length;
      if (size > 20 * 1024 * 1024) {
        child.kill('SIGKILL'); // 保險上限：不正常頁面無限膨脹就直接放棄
        finish(null);
        return;
      }
      chunks.push(d);
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 && chunks.length ? Buffer.concat(chunks).toString('utf8') : null));
  });
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
  jsonLdNodes: Record<string, unknown>[]; // 解析後的 JSON-LD 節點（完整欄位，給 Schema 完整度規則判斷用，非只留 @type）
  hasBreadcrumb: boolean;
  canonical: string;
  noindex: boolean;
  hasViewport: boolean;
  analytics: string[];   // 這頁找到的追蹤碼（GA4/UA/GTM/GSC）
  internalLinks: string[]; // 正規化後的同網域連結
  externalCount: number;
  isHome: boolean;
  mainText: string;      // 純文字摘要（給 E-E-A-T 取樣用，截斷）
  viaSitemap: boolean;   // true＝由 sitemap 補爬（非首頁連結可達）；孤島判斷不把這種頁當「可達來源」
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
  reachedCap: boolean;   // 是否碰到頁數上限（代表可能沒爬完整站）
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

// 保留查詢字串的正規化：查詢字串型 CMS（services.php?category_id=1）的每個 query 都是不同頁，
// 補爬 sitemap 時要用這個 key 去重，才不會把 188 個網址壓成十幾條路徑。
export function normalizeFull(u: string): string {
  try {
    const x = new URL(u);
    let p = x.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return x.origin + p + x.search;
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
  // Next.js 自己的建置資源目錄——RSC 酬載掃描常混進這個路徑，不是真的頁面（跟 lib/tkd-crawler.ts 同款規則）
  if (/\/_next\//i.test(raw)) return false;
  // 登入/購物車/會員等功能頁不會有 Product/Article schema，常需要登入態才能開（會抓取失敗浪費爬蟲頁數），
  // 各平台變體：sign_in（Shopline）、ShoppingCart/VipMember/TradesOrder/ECoupon/TraceSalePage（91APP）
  if (/\/(login|logout|register|signup|signin|cart|checkout|account|member|members|wishlist|favorite|search|compare)(\/|\?|$)/i.test(raw)) return false;
  if (/(sign[-_]?in|sign[-_]?up|shoppingcart|vipmember|tradesorder|ecoupon|tracesalepage)/i.test(raw)) return false;
  return true;
}

// 前端框架（多為 Next.js App Router，91APP 等平台常用）常把選單資料序列化進 RSC 串流酬載
// （<script>self.__next_f.push(...)</script> 裡一段跳脫過的 JSON），要等瀏覽器執行 JS 才會真的
// 組出 <a> 標籤——HTML 原始碼裡完全沒有 <a> 元素，純 DOM 選擇器抓不到。但酬載本身就是跳脫過的
// JSON 字串，直接對整份 HTML 全文找 "href":"..." 這個鍵值對還是撈得到，不必真的執行 JS／裝
// headless 瀏覽器。跟 lib/tkd-crawler.ts 的 scanRscHrefs 同一招，這裡重複一份小函式是刻意保持
// 兩支 crawler 互不依賴。
function scanRscHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /\\?"href\\?"\s*:\s*\\?"([^"\\]+)\\?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// 收集整份 @graph 裡「有 @id 且不只是純參照」的節點，遞迴進巢狀物件收集，不能只看頂層節點。
// 實測 stack.com.tw（Yoast SEO）的 logo 是巢狀塞在 Organization.logo 裡的完整 ImageObject（帶自己的
// @id），從沒被拉成頂層 @graph 節點；Organization.image 則是指向同一個 @id 的純參照 {"@id": "..."}。
// 舊版 byId 只收頂層節點的 @id，收不到這種「定義藏在巢狀欄位裡」的情況，image 因此解析不出來、
// 「補完 Schema」表單顯示成「未設定」，明明 logo 資料其實齊全。
function collectIdDefs(value: unknown, byId: Map<string, Record<string, unknown>>): void {
  if (Array.isArray(value)) { value.forEach((v) => collectIdDefs(v, byId)); return; }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const id = obj['@id'];
    // 只收「有實際內容」的節點當定義來源，純參照（只有 @id 一個 key）不能拿來當定義，否則會互相蓋掉
    if (typeof id === 'string' && Object.keys(obj).length > 1 && !byId.has(id)) byId.set(id, obj);
    for (const v of Object.values(obj)) collectIdDefs(v, byId);
  }
}

// 把節點裡「純 @id 參照」的欄位換成同一份 @graph 裡對應的實際節點，例如 WordPress Yoast SEO
// 常把 logo/image 拆成獨立的 ImageObject 節點，node.logo 只會是 {"@id": ".../#logo"}，
// 不解析的話 stringField() 這類讀值邏輯會誤判成「未設定」。只做一層淺層替換，避免循環參照。
function resolveIdRefs(value: unknown, byId: Map<string, Record<string, unknown>>): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveIdRefs(v, byId));
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '@id') {
      const id = (value as { '@id': unknown })['@id'];
      if (typeof id === 'string' && byId.has(id)) return byId.get(id);
    }
  }
  return value;
}

// 從 root 抓所有 JSON-LD 節點（含巢狀 @graph），回傳型別清單與完整節點（給欄位完整度檢查用）
export function extractJsonLd(root: NHTMLElement): { types: string[]; nodes: Record<string, unknown>[] } {
  const types = new Set<string>();
  const nodes: Record<string, unknown>[] = [];
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const text = script.rawText?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const items: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { '@graph'?: unknown[] })['@graph'])
          ? (data as { '@graph': unknown[] })['@graph']
          : [data];
      const objItems = items.filter((n): n is Record<string, unknown> => !!n && typeof n === 'object');
      const byId = new Map<string, Record<string, unknown>>();
      objItems.forEach((n) => collectIdDefs(n, byId));
      for (const node of objItems) {
        const resolved = byId.size > 0 ? (Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveIdRefs(v, byId)])) as Record<string, unknown>) : node;
        nodes.push(resolved);
        const t = resolved['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
      }
    } catch {
      /* 解析失敗略過 */
    }
  }
  return { types: [...types], nodes };
}

// 擷取單頁事實
function extractPageFacts(html: string, url: string, depth: number, status: number, ok: boolean, origin: string, viaSitemap = false): PageFacts {
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

  const { types: jsonLdTypes, nodes: jsonLdNodes } = extractJsonLd(root);
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

  // 補掃 RSC 酬載：91APP 等平台的選單完全靠前端 JS 渲染，原始 HTML 裡沒有 <a> 標籤可讀，
  // 上面那段選擇器會抓到 0 或極少連結（只剩會員/購物車這類固定殼連結）
  for (const raw of scanRscHrefs(html)) {
    if (!isCrawlableHref(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, url);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.origin === origin) internal.add(normalizeUrl(abs.href));
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
    jsonLdNodes,
    hasBreadcrumb,
    canonical: (root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim(),
    noindex: /noindex/.test(robots) || /noindex/.test(googlebot),
    hasViewport: !!(root.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').trim(),
    analytics,
    internalLinks: [...internal],
    externalCount,
    isHome: pathname === '/',
    mainText,
    viaSitemap,
  };
}

// 抓 sitemap.xml，解析出所有頁面網址（支援 sitemapindex 巢狀，最多抓 30 份、2000 個網址）
// 從 robots.txt 找網站宣告的 sitemap 位置：很多平台不放在 /sitemap.xml，例如 91APP 放在
// /Sitemap/店家ID/Sitemap_Index.xml，只有 robots.txt 的 Sitemap: 這行有寫（跟 lib/tkd-crawler.ts 同款規則）
async function sitemapsFromRobots(origin: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    const out: string[] = [];
    for (const m of text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) out.push(m[1]);
    return out;
  } catch {
    return [];
  }
}

// 讀取單份 sitemap 內容：支援 gzip 壓縮（.xml.gz 或內容以 gzip magic number 開頭，91APP 常見）
async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      try {
        return gunzipSync(buf).toString('utf8');
      } catch {
        return null;
      }
    }
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

// 子 sitemap 檔名關鍵字 → 優先權重，數字越小越先抓。深度檢查有 25 頁上限，91APP 這類
// 平台常把分類頁（ShopCategory）排在 sitemap index 最前面又量體最大，會把預算吃光，導致真正
// 有 Product/Article schema 的商品頁、文章頁反而抓不到（跟 lib/tkd-platform.ts 的
// ruleForSitemap／TYPE_ORDER 同一招，這裡用關鍵字比對通用命名而非只認 91APP 專屬檔名）
function sitemapPriority(sitemapName: string): number {
  const n = sitemapName.toLowerCase();
  if (/salepage|shopitem|[/_-]products?[/_.-]|[/_-]item[/_.-]/.test(n)) return 0; // 商品頁：schema 檢查最想要
  if (/article|blog|post|news/.test(n)) return 1; // 文章頁：schema 檢查第二想要
  if (/category|[/_-]tags?[/_.-]/.test(n)) return 5; // 分類/標籤頁：量體大又通常沒有 Product/Article schema，晚點抓
  if (/searchresult|[/_-]search[/_.-]/.test(n)) return 9; // 搜尋結果頁：純噪音，排最後
  return 3; // 其他未知子 sitemap：中間優先權
}

export async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const seen = new Set<string>();
  const fromRobots = await sitemapsFromRobots(origin);
  const queue = [`${origin}/sitemap.xml`, ...fromRobots];
  const outSeen = new Set<string>();
  const collected: { url: string; priority: number }[] = [];
  let fetched = 0;
  while (queue.length && outSeen.size < 2000 && fetched < 30) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    fetched++;
    const xml = await fetchSitemapText(sm);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const isIndex = /<sitemapindex/i.test(xml);
    const priority = sitemapPriority(sm);
    for (const loc of locs) {
      if (isIndex) queue.push(loc.trim());
      else {
        // 存「原始」網址（保留結尾斜線/查詢字串）：GSC URL 檢測要用 Google 實際收錄的原網址，
        // 正規化（去斜線）會讓 Google 回「無法辨識的網址」。孤島比對時才另外做正規化。
        const url = loc.trim();
        if (outSeen.has(url)) continue;
        outSeen.add(url);
        collected.push({ url, priority });
      }
    }
  }
  // 穩定排序：同優先權內維持原本抓取順序，只把商品/文章子 sitemap 的網址往前挪
  collected.sort((a, b) => a.priority - b.priority);
  return collected.map((c) => c.url);
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

  // ── 階段二：sitemap 補爬 ──
  // 首頁選單常靠 JS 動態產生，靜態 BFS 只看得到少數連結（如 zeyutang 首頁只抓到 16 頁）。
  // 把 sitemap 有、但首頁 2 層內沒連到的頁補進來實際爬取，讓逐頁檢查（TKD、h 標籤、圖片等）涵蓋全站。
  // 這些頁標記 viaSitemap，孤島判斷不會把它們當「首頁連結可達」的來源。
  if (pages.length < maxPages) {
    // 去重用「保留查詢字串」的 key：本站是查詢字串型 CMS（services.php?category_id=1…），
    // 一般 normalizeUrl 會丟掉查詢字串，188 個網址會被壓成 16 條路徑而全被判定重複。
    const crawledKeys = new Set(pages.map((p) => normalizeFull(p.url)));
    const extra: string[] = [];
    const extraKeys = new Set<string>();
    for (const u of sitemapUrls) {
      const k = normalizeFull(u);
      if (crawledKeys.has(k) || extraKeys.has(k)) continue; // 已爬過或已排入的不重爬
      extraKeys.add(k);
      extra.push(u); // 用「原始」網址（保留查詢字串/結尾斜線）去爬實際頁面
    }
    for (let i = 0; i < extra.length && pages.length < maxPages; i += concurrency) {
      const remaining = maxPages - pages.length;
      const batch = extra.slice(i, i + concurrency).slice(0, remaining);
      const facts = await Promise.all(
        batch.map(async (url) => {
          try {
            const res = await fetchWithTimeout(url);
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('html')) return emptyFacts(url, 1, res.status, res.ok, origin, true);
            return extractPageFacts(await res.text(), url, 1, res.status, res.ok, origin, true);
          } catch {
            return emptyFacts(url, 1, 0, false, origin, true);
          }
        }),
      );
      for (const f of facts) {
        pages.push(f);
        opts.onProgress?.({ crawled: pages.length, discovered: seen.size, cap: maxPages });
      }
    }
    if (pages.length >= maxPages) reachedCap = true;
  }

  return { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap };
}

// 非 HTML / 連不上頁面的空事實
function emptyFacts(url: string, depth: number, status: number, ok: boolean, origin: string, viaSitemap = false): PageFacts {
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
    jsonLdTypes: [], jsonLdNodes: [], hasBreadcrumb: false, canonical: '', noindex: false, hasViewport: false,
    analytics: [], internalLinks: [], externalCount: 0, isHome, mainText: '', viaSitemap,
  };
}
