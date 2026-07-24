import { parse, type HTMLElement } from 'node-html-parser';
import { gunzipSync } from 'node:zlib';
import { fetchPageSearchStats } from './site-audit-gsc';

// h1 精修 callback：原始 <h1> 讀不到時，由呼叫端（平台 adapter）從 server 端最佳來源還原 h1。
// 用注入方式而非直接 import 平台模組，讓 crawler 不依賴 tkd-platform（避免循環相依）
export type RefineH1 = (root: HTMLElement, url: string) => string;

// 單一頁面的現有 TKD 資料（現有 title / description / keywords / h1）
export type PageTkd = {
  url: string;        // 頁面網址
  label?: string;     // 選單名稱（重點頁模式才有；用來當超連結的顯示文字）
  title: string;      // 現有 <title>
  description: string; // 現有 meta description
  keywords: string;   // 現有 meta keywords
  h1: string;         // 現有第一個 <h1>
  content?: string;   // 頁面主要內容摘要（供 AI 生成建議時參考）
  error?: string;     // 抓取失敗時的錯誤訊息
};

// 頁面參照：網址 + 選單名稱（label 只有重點頁模式會帶）
export type PageRef = { url: string; label?: string };

// 抓網頁時偽裝成瀏覽器，避免被某些網站擋掉
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 帶逾時的 fetch（預設 15 秒），避免單頁卡住整個流程
async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml' },
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

// 正規化站台網址：補上 https://、去掉結尾斜線
export function normalizeSite(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/\/+$/, '');
}

// 從一段 sitemap XML 內容抓出所有 <loc> 網址（regex 對 XML 最穩，不依賴 HTML parser）
function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim();
    if (url) locs.push(url);
  }
  return locs;
}

// 讀取 sitemap 內容：支援 gzip 壓縮（.xml.gz 或內容以 gzip magic number 開頭，如 91APP）
async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // gzip 檔開頭固定是 0x1f 0x8b，fetch 不會自動解壓（伺服器沒標 Content-Encoding）
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

// 從 robots.txt 找網站宣告的 sitemap 位置（很多平台不放在 /sitemap.xml，例如 91APP 放在 /Sitemap/店家ID/...）
async function sitemapsFromRobots(site: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${site}/robots.txt`);
    if (!res.ok) return [];
    const text = await res.text();
    const out: string[] = [];
    for (const m of text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) out.push(m[1]);
    return out;
  } catch {
    return [];
  }
}

// 多語系 sitemap（?locale=xx，如 Shopline）只挑一種語系展開，避免同一頁被各語系重複收錄
// 優先中文（zh-hant / zh-tw），其次 default，都沒有才全展開
function pickLocaleSitemaps(locs: string[]): string[] {
  const withLocale = locs.filter((l) => /[?&]locale=/i.test(l));
  if (withLocale.length === 0) return locs;
  const rest = locs.filter((l) => !/[?&]locale=/i.test(l));
  const zh = withLocale.filter((l) => /[?&]locale=zh/i.test(l));
  if (zh.length > 0) return [...rest, ...zh];
  const def = withLocale.filter((l) => /[?&]locale=default/i.test(l));
  if (def.length > 0) return [...rest, ...def];
  return locs;
}

// 從客戶網站 sitemap 蒐集頁面網址；支援 sitemap index（巢狀子 sitemap）、gzip、多語系變體，並設頁數上限
async function collectFromSitemap(site: string, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const result: string[] = [];
  // 先讀 robots.txt 的 Sitemap 宣告，再退回常見的兩個位置
  const declared = await sitemapsFromRobots(site);
  const queue = [...declared, `${site}/sitemap.xml`, `${site}/sitemap_index.xml`];
  const visitedSitemaps = new Set<string>();

  while (queue.length > 0 && result.length < limit) {
    const sitemapUrl = queue.shift()!;
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    const xml = await fetchSitemapText(sitemapUrl);
    if (!xml) continue;

    const locs = extractLocs(xml);
    // 判斷這是 sitemap index（子 sitemap 清單）還是一般 sitemap（頁面清單）
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    const children: string[] = []; // 子 sitemap（含 .xml.gz 與 ?locale= 變體）
    const pages: string[] = []; // 一般頁面
    for (const loc of locs) {
      if (isIndex || /\.xml(\.gz)?($|\?)/i.test(loc)) children.push(loc);
      else pages.push(loc);
    }
    for (const child of pickLocaleSitemaps(children)) {
      if (!visitedSitemaps.has(child)) queue.push(child);
    }
    for (const loc of pages) {
      if (!seen.has(loc)) {
        seen.add(loc);
        result.push(loc);
        if (result.length >= limit) break;
      }
    }
  }
  return result;
}

// 從 GSC Search Analytics 補頁：純 fetch 爬蟲看不到前端框架動態插入的選單（如 React/Next.js
// 用 JS 組出的導覽列，HTML 原始碼裡根本沒有 <a> 標籤），但 Google 的爬蟲有執行 JS 渲染再收錄，
// 近 90 天有曝光的網址就代表 Google 找得到這頁——借這份清單補回選單/sitemap 漏掉的頁面。
// 未授權該站 GSC 或無資料時回空陣列，靜默跳過不影響原本流程
async function collectFromGsc(site: string): Promise<string[]> {
  try {
    const { stats } = await fetchPageSearchStats(site);
    return [...stats.keys()];
  } catch {
    return [];
  }
}

// 沒有 sitemap 時的退路：爬首頁，抓同網域的內部連結
async function collectFromHomepage(site: string, limit: number): Promise<string[]> {
  const seen = new Set<string>([site]);
  const result: string[] = [site];
  let host: string;
  try {
    host = new URL(site).host;
  } catch {
    return result;
  }

  try {
    const res = await fetchWithTimeout(site);
    if (!res.ok) return result;
    // 有些網站裸網域首頁會轉址到 www，但內頁只有 www 版存在；
    // 改用轉址後的最終網址當連結解析基底，避免組出 404 的裸網域內頁
    let base = site;
    if (res.url) {
      base = res.url.replace(/\/+$/, '');
      host = new URL(base).host;
      result[0] = base; // 首頁本身也改記轉址後的網址
      seen.add(base);
    }
    const html = await res.text();
    const root = parse(html);
    for (const a of root.querySelectorAll('a')) {
      if (result.length >= limit) break;
      const href = a.getAttribute('href');
      if (!href) continue;
      let abs: string;
      try {
        abs = new URL(href, base).href;
      } catch {
        continue;
      }
      // 只收同網域、http(s)、去掉錨點
      const clean = abs.split('#')[0].replace(/\/+$/, '');
      try {
        if (new URL(clean).host !== host) continue;
      } catch {
        continue;
      }
      if (!/^https?:/i.test(clean)) continue;
      if (!seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }
  } catch {
    // 首頁抓不到就只回傳首頁本身
  }
  return result;
}

// 把編碼過的網址還原成可讀（中文 slug）；失敗就保留原字串
export function prettyUrl(u: string): string {
  try {
    return decodeURI(u);
  } catch {
    return u;
  }
}

// 排除非內容連結（信箱、電話、js、Cloudflare、WP 後台、資源檔）
function isContentLink(url: string): boolean {
  if (/^(mailto:|tel:|javascript:)/i.test(url)) return false;
  if (/\/cdn-cgi\//i.test(url)) return false; // Cloudflare email 保護等
  if (/\/wp-(admin|login|json)/i.test(url)) return false; // WordPress 後台
  // Next.js 自己的建置資源目錄——RSC 酬載掃描／無頭渲染撈到的 <link> href 常混進這裡，不是真的頁面
  if (/\/_next\//i.test(url)) return false;
  // 登入/購物車/會員/搜尋等功能頁，對 SEO 稽核沒意義
  if (/\/(login|logout|register|signup|signin|cart|checkout|account|member|members|wishlist|favorite|search|compare)(\/|\?|$)/i.test(url)) return false;
  // 各平台的功能頁變體：sign_in（Shopline）、ShoppingCart/VipMember/TradesOrder/ECoupon/TraceSalePage（91APP）
  if (/(sign[-_]?in|sign[-_]?up|shoppingcart|vipmember|tradesorder|ecoupon|tracesalepage)/i.test(url)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|mjs|json|woff2?|ttf|eot|ico|map)(\?|$)/i.test(url)) return false;
  return /^https?:/i.test(url);
}

// 部落格分類頁名加「部落格-」前綴，方便在登記表一眼區分（例如兩個「AI工具」）
function withBlogPrefix(url: string, label: string): string {
  const p = prettyUrl(url).toLowerCase();
  const isBlog = /\/blog|\/news|lastest_news|\/article|\/posts|\/category|知識|網誌|文章/.test(p);
  return isBlog && label && !label.startsWith('部落格') ? `部落格-${label}` : label;
}

// 前端框架（多為 Next.js App Router）常把選單資料序列化進 RSC 串流酬載
// （<script>self.__next_f.push(...)</script> 裡一段跳脫過的 JSON），要等瀏覽器執行 JS
// 才會真的組出 <a> 標籤——HTML 原始碼裡完全沒有 <a> 元素，純 DOM 選擇器抓不到。
// 但酬載本身就是跳脫過的 JSON 字串，直接對整份 HTML 全文找 "href":"..." 這個鍵值對
// 還是撈得到，不必真的執行 JS／裝 headless 瀏覽器；沒有對應顯示文字時留空，
// 跟 sitemap 補的頁一樣，寫入時退回抓到的 title/h1
function scanRscHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /\\?"href\\?"\s*:\s*\\?"([^"\\]+)\\?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// 蒐集「選單頁」：首頁 + 主選單(header/nav)連結，並保留選單文字當頁名
// 回傳 base（轉址後的最終網址，後續抓 sitemap 要用同一個基底）與頁面清單
async function collectMenuPages(
  site: string,
  limit: number,
): Promise<{ base: string; pages: PageRef[] }> {
  let host: string;
  try {
    host = new URL(site).host;
  } catch {
    return { base: site, pages: [{ url: site, label: '首頁' }] };
  }

  const picked = new Map<string, PageRef>(); // key: 正規化網址（去尾斜線、小寫）
  const add = (raw: string, label?: string) => {
    const clean = raw.split('#')[0].replace(/\/+$/, '');
    if (!isContentLink(clean)) return;
    try {
      if (new URL(clean).host !== host) return;
    } catch {
      return;
    }
    const key = clean.toLowerCase();
    const name = (label ?? '').replace(/\s+/g, ' ').trim();
    if (!picked.has(key)) picked.set(key, { url: clean, label: name });
    else if (!picked.get(key)!.label && name) picked.get(key)!.label = name; // 補上先前缺的頁名
  };

  // 連結解析基底：有些網站裸網域首頁會轉址到 www，但內頁只有 www 版存在，
  // 直接用使用者輸入的網址組內頁會 404，所以抓到首頁後改用轉址後的最終網址
  let base = site;
  let root: ReturnType<typeof parse> | null = null;
  let rawHtml = ''; // 保留原始 HTML 文字，給下面的 RSC 選單掃描用（root 解析後拿不到原文）

  // 首頁抓失敗會讓整組蒐集垮掉（拿不到轉址後的 base，後面 sitemap 也會撈錯位置），
  // 偶發網路失敗值得重試一次
  for (let attempt = 0; attempt < 2 && !root; attempt++) {
    try {
      const res = await fetchWithTimeout(site);
      if (res.ok) {
        if (res.url) {
          base = res.url.replace(/\/+$/, '');
          host = new URL(base).host; // host 也同步更新，否則 www 連結會被同網域檢查濾掉
        }
        rawHtml = await res.text();
        root = parse(rawHtml);
      }
    } catch {
      // 再試一次；兩次都失敗就只回傳首頁
    }
  }

  add(base, '首頁'); // 首頁一定放進去（記轉址後的網址）

  if (root) {
    // 先抓語意化主選單（header 與 nav）內的連結——這些通常是網站的重點頁。
    // 刻意不掃全頁連結，才不會把首頁列出的一篇篇文章也撈進來。
    let menuLinks = 0;
    for (const a of root.querySelectorAll('header a, nav a')) {
      const href = a.getAttribute('href');
      if (!href) continue;
      try {
        add(new URL(href, base).href, a.text); // a.text 就是選單顯示文字
        menuLinks++;
      } catch {
        /* 略過無法解析的連結 */
      }
    }

    // 退路：有些模板平台（Vue SPA 等）選單不放在語意化 <header>/<nav>，而是掛在
    // <ul class="_header_nav"> 這類容器，上面會抓到 0、選單名全空、登記表只能顯示網址。
    // 改用「選單結構」判斷：取呈「<ul>/<nav> 裡有 ≥3 個 <li>、且 a 文字短」的連結當選單名
    // （文字長的多半是文章標題，用長度上限濾掉；圖片連結沒文字也濾掉）。
    // 只在語意化選單幾乎抓不到（<3）時才啟動，不動原本正常的站。
    if (menuLinks < 3) {
      for (const ul of root.querySelectorAll('ul, nav')) {
        const liCount = ul.querySelectorAll('li').length;
        const links = ul
          .querySelectorAll('a')
          .filter((a) => {
            const t = a.text.replace(/\s+/g, ' ').trim();
            return t && !t.startsWith('<') && t.length <= 20; // 有短文字、非圖片
          });
        if (liCount < 3 || links.length < 3 || links.length > 20) continue;
        for (const a of links) {
          const href = a.getAttribute('href');
          if (!href) continue;
          try {
            add(new URL(href, base).href, a.text);
          } catch {
            /* 略過無法解析的連結 */
          }
        }
      }
    }
  }

  // 掃 RSC 酬載補回前端動態插入、完全沒有 <a> 標籤的選單項（如安心檢測、購物須知）；
  // 沒有顯示文字，靠 add() 既有的去重規則自然不蓋掉前面已收到頁名的同一頁
  for (const href of scanRscHrefs(rawHtml)) {
    try {
      add(new URL(href, base).href);
    } catch {
      /* 略過無法解析的連結 */
    }
  }

  return {
    base,
    pages: Array.from(picked.values())
      .slice(0, limit)
      .map((p) => ({ url: p.url, label: withBlogPrefix(p.url, p.label ?? '') })),
  };
}

// 蒐集「候選頁」：選單頁（有頁名）＋整份 sitemap 合併、去重、硬規則過濾功能頁。
// 這裡刻意收得寬，型態判斷與是否收錄交給 AI 分類（lib/tkd-classify.ts）與使用者勾選
export async function collectCandidates(siteInput: string, limit = 300): Promise<PageRef[]> {
  const site = normalizeSite(siteInput);
  const { base, pages } = await collectMenuPages(site, limit);

  // 去重 key：先統一編碼（選單連結經 new URL() 會把中文轉成 %E3%80%90...，
  // sitemap 來的是原始中文字，不先 decode 兩邊 key 對不上、同一頁會重複收），
  // 再去錨點、小寫、去 locale 前綴（/zh-hant、/en 等）、去尾斜線——順序不能反，
  // locale 去完可能只剩尾斜線（如 /zh-hant → /），要最後再去尾斜線才會跟首頁 key 相同
  // （Shopline 的 sitemap 網址帶 /zh-hant/，跟選單抓到的不帶前綴網址其實是同一頁）
  const keyOf = (u: string) =>
    prettyUrl(u.split('#')[0])
      .toLowerCase()
      .replace(/(https?:\/\/[^/]+)\/(zh-hant|zh-tw|zh-cn|en(-us)?|ja|default)(\/|$)/, '$1/')
      .replace(/\/+$/, '');
  const picked = new Map<string, PageRef>();
  for (const p of pages) picked.set(keyOf(p.url), p);

  let baseHost = '';
  try {
    baseHost = new URL(base).host;
  } catch {
    /* base 一定來自合法網址，理論上不會走到這 */
  }

  // GSC 優先於 sitemap：GSC 是「Google 實際觀察到有搜尋需求」的頁面，比 sitemap
  // 硬塞的網址清單（常常一堆雜訊文章）更能代表「重要頁」，要先卡到 limit 名額，
  // 不能等 sitemap 塞滿才輪到——大站 sitemap 頁數一多，GSC 頁會被排擠掉
  if (picked.size < limit) {
    // GSC 用轉址後的 base 查 property，跟 sitemap 同一個基底
    const fromGsc = await collectFromGsc(base);
    for (const u of fromGsc) {
      if (picked.size >= limit) break;
      const clean = u.split('#')[0].replace(/\/+$/, '');
      if (!isContentLink(clean)) continue;
      try {
        if (new URL(clean).host !== baseHost) continue;
      } catch {
        continue;
      }
      const key = keyOf(clean);
      // 選單已收過的頁不重複收（保留選單頁名）
      if (!picked.has(key)) picked.set(key, { url: clean });
    }
  }

  if (picked.size < limit) {
    // sitemap 用轉址後的 base 抓（裸網域的 sitemap/內頁可能 404）；補選單＋GSC 沒收到的頁
    const fromSitemap = await collectFromSitemap(base, limit * 3);
    for (const u of fromSitemap) {
      if (picked.size >= limit) break;
      const clean = u.split('#')[0].replace(/\/+$/, '');
      if (!isContentLink(clean)) continue;
      try {
        if (new URL(clean).host !== baseHost) continue;
      } catch {
        continue;
      }
      const key = keyOf(clean);
      // 選單/GSC 已收過的頁不重複收；sitemap 來的沒頁名，寫入時用 title
      if (!picked.has(key)) picked.set(key, { url: clean });
    }
  }

  return Array.from(picked.values()).slice(0, limit);
}

// 檢查單頁是否 noindex（meta robots／googlebot 標籤或 X-Robots-Tag 回應標頭）。
// 抓取失敗（網路錯誤、非 200）不視為 noindex——寧可保留讓使用者看到，第②步爬的時候會回報錯誤
async function isNoindex(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return false;
    if (/noindex/i.test(res.headers.get('x-robots-tag') ?? '')) return true;
    const root = parse(await res.text());
    for (const m of root.querySelectorAll('meta')) {
      const name = (m.getAttribute('name') ?? '').toLowerCase();
      if (name !== 'robots' && name !== 'googlebot') continue;
      if (/noindex/i.test(m.getAttribute('content') ?? '')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// 濾掉 noindex 頁（小積木拍板：客戶自己都不給搜尋引擎收的頁，放進登記表沒意義）。
// 以並發池逐頁檢查，蒐集階段會因此多花一點時間，但勾選清單從源頭就乾淨
export async function filterOutNoindex(pages: PageRef[], concurrency = 8): Promise<PageRef[]> {
  const flags: boolean[] = new Array(pages.length);
  let cursor = 0;
  async function worker() {
    while (cursor < pages.length) {
      const i = cursor++;
      flags[i] = await isNoindex(pages[i].url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
  return pages.filter((_, i) => !flags[i]);
}

// 蒐集客戶網站的頁面網址
// scope='important'：候選頁（選單＋sitemap 合併，預設）；scope='all'：全站 sitemap
export async function collectUrls(
  siteInput: string,
  limit = 100,
  scope: 'important' | 'all' = 'important',
): Promise<PageRef[]> {
  const site = normalizeSite(siteInput);
  if (scope === 'important') {
    const candidates = await collectCandidates(site, limit);
    if (candidates.length > 0) return candidates;
  }
  // 全站/退路模式沒有選單名，label 留空（寫入時改用網址或標題當顯示文字）
  const fromSitemap = await collectFromSitemap(site, limit);
  if (fromSitemap.length > 0) return fromSitemap.map((url) => ({ url }));
  const fromHome = await collectFromHomepage(site, limit);
  return fromHome.map((url) => ({ url }));
}

// 抓單一頁面的現有 TKD
// refineH1：原始 <h1> 讀不到時的還原 callback（如 91APP 的 h1 由 JS 渲染，改從 og:title／麵包屑還原）
export async function fetchPageTkd(page: PageRef, refineH1?: RefineH1): Promise<PageTkd> {
  const { url, label } = page;
  const base: PageTkd = { url, label, title: '', description: '', keywords: '', h1: '' };
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
    const html = await res.text();
    const root = parse(html);

    // SPA 網站（如 91APP）的 <title> 是空殼等 JS 填，但 og:title 有完整內容，當退路
    const ogTitle =
      root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ?? '';
    const title = (root.querySelector('title')?.text?.trim() || ogTitle) ?? '';
    // meta description / keywords 大小寫不一，逐一嘗試；沒有就退 og:description
    const description =
      root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
      root.querySelector('meta[name="Description"]')?.getAttribute('content')?.trim() ||
      root.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
      '';
    const keywords =
      root.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() ??
      root.querySelector('meta[name="Keywords"]')?.getAttribute('content')?.trim() ??
      '';
    // 取第一個「有文字」的 h1：有些頁面用 Elementor 產生巢狀 h1（外層空殼、內層才是標題），
    // 只抓第一個 h1 會拿到空字串，改成找第一個非空的
    const rawH1 =
      root
        .querySelectorAll('h1')
        .map((el) => el.text.replace(/\s+/g, ' ').trim())
        .find((t) => t) ?? '';
    // 讀不到真正的 h1 時才用 callback 還原（91APP 等 SPA 的 h1 由 JS 渲染）；
    // 必須在下面移除 script 前呼叫——麵包屑資料在 <script type="ld+json"> 裡，移掉就讀不到
    const h1 = rawH1 || (refineH1 ? refineH1(root, url).replace(/\s+/g, ' ').trim() : '');

    // 抓頁面正文：移除選單/頁尾/腳本等雜訊後，取主要內容前 1500 字（供 AI 生成建議參考）
    root
      .querySelectorAll('script, style, noscript, nav, header, footer, aside, form, svg')
      .forEach((el) => el.remove());
    const main =
      root.querySelector('main') ??
      root.querySelector('article') ??
      root.querySelector('body') ??
      root;
    const content = main.text.replace(/\s+/g, ' ').trim().slice(0, 1500);

    return { url, label, title, description, keywords, h1, content };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

// 以並發池逐頁抓 TKD（預設一次 6 個），避免一次打太多請求
// refineH1：h1 讀不到時的還原 callback，會傳給每一頁的 fetchPageTkd（91APP 才需要）
export async function fetchAllTkd(
  pages: PageRef[],
  concurrency = 6,
  refineH1?: RefineH1,
): Promise<PageTkd[]> {
  const results: PageTkd[] = new Array(pages.length);
  let cursor = 0;

  async function worker() {
    while (cursor < pages.length) {
      const i = cursor++;
      results[i] = await fetchPageTkd(pages[i], refineH1);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pages.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
