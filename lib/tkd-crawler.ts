import { parse } from 'node-html-parser';

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

// 從客戶網站 sitemap 蒐集頁面網址；支援 sitemap index（巢狀子 sitemap），並設頁數上限
async function collectFromSitemap(site: string, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const result: string[] = [];
  // 待處理的 sitemap 佇列，先試常見的兩個位置
  const queue = [`${site}/sitemap.xml`, `${site}/sitemap_index.xml`];
  const visitedSitemaps = new Set<string>();

  while (queue.length > 0 && result.length < limit) {
    const sitemapUrl = queue.shift()!;
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    let xml: string;
    try {
      const res = await fetchWithTimeout(sitemapUrl);
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }

    const locs = extractLocs(xml);
    // 判斷這是 sitemap index（子 sitemap 清單）還是一般 sitemap（頁面清單）
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    for (const loc of locs) {
      if (isIndex || /\.xml($|\?)/i.test(loc)) {
        // 子 sitemap，加入佇列繼續展開
        if (!visitedSitemaps.has(loc)) queue.push(loc);
      } else {
        if (!seen.has(loc)) {
          seen.add(loc);
          result.push(loc);
          if (result.length >= limit) break;
        }
      }
    }
  }
  return result;
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
    const html = await res.text();
    const root = parse(html);
    for (const a of root.querySelectorAll('a')) {
      if (result.length >= limit) break;
      const href = a.getAttribute('href');
      if (!href) continue;
      let abs: string;
      try {
        abs = new URL(href, site).href;
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
  // 登入/購物車/會員/搜尋等功能頁，對 SEO 稽核沒意義
  if (/\/(login|logout|register|signup|signin|cart|checkout|account|member|members|wishlist|favorite|search|compare)(\/|\?|$)/i.test(url)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)(\?|$)/i.test(url)) return false;
  return /^https?:/i.test(url);
}

// 部落格分類頁名加「部落格-」前綴，方便在登記表一眼區分（例如兩個「AI工具」）
function withBlogPrefix(url: string, label: string): string {
  const p = prettyUrl(url).toLowerCase();
  const isBlog = /\/blog|\/news|lastest_news|\/article|\/posts|\/category|知識|網誌|文章/.test(p);
  return isBlog && label && !label.startsWith('部落格') ? `部落格-${label}` : label;
}

// 蒐集「重點頁」：首頁 + 主選單(header/nav)連結，並保留選單文字當頁名
async function collectImportantPages(site: string, limit: number): Promise<PageRef[]> {
  let host: string;
  try {
    host = new URL(site).host;
  } catch {
    return [{ url: site, label: '首頁' }];
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

  add(site, '首頁'); // 首頁一定放進去

  try {
    const res = await fetchWithTimeout(site);
    if (res.ok) {
      const root = parse(await res.text());

      // 只抓主選單（header 與 nav）內的連結——這些就是網站的重點頁。
      // 刻意不掃全頁連結，才不會把首頁列出的一篇篇文章也撈進來。
      for (const a of root.querySelectorAll('header a, nav a')) {
        const href = a.getAttribute('href');
        if (!href) continue;
        try {
          add(new URL(href, site).href, a.text); // a.text 就是選單顯示文字
        } catch {
          /* 略過無法解析的連結 */
        }
      }
    }
  } catch {
    // 首頁抓不到就只回傳首頁
  }

  return Array.from(picked.values())
    .slice(0, limit)
    .map((p) => ({ url: p.url, label: withBlogPrefix(p.url, p.label ?? '') }));
}

// 蒐集客戶網站的頁面網址
// scope='important'：只抓重點頁（預設）；scope='all'：全站 sitemap
export async function collectUrls(
  siteInput: string,
  limit = 100,
  scope: 'important' | 'all' = 'important',
): Promise<PageRef[]> {
  const site = normalizeSite(siteInput);
  if (scope === 'important') {
    const important = await collectImportantPages(site, limit);
    if (important.length > 0) return important;
  }
  // 全站/退路模式沒有選單名，label 留空（寫入時改用網址或標題當顯示文字）
  const fromSitemap = await collectFromSitemap(site, limit);
  if (fromSitemap.length > 0) return fromSitemap.map((url) => ({ url }));
  const fromHome = await collectFromHomepage(site, limit);
  return fromHome.map((url) => ({ url }));
}

// 抓單一頁面的現有 TKD
export async function fetchPageTkd(page: PageRef): Promise<PageTkd> {
  const { url, label } = page;
  const base: PageTkd = { url, label, title: '', description: '', keywords: '', h1: '' };
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
    const html = await res.text();
    const root = parse(html);

    const title = root.querySelector('title')?.text?.trim() ?? '';
    // meta description / keywords 大小寫不一，逐一嘗試
    const description =
      root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ??
      root.querySelector('meta[name="Description"]')?.getAttribute('content')?.trim() ??
      '';
    const keywords =
      root.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() ??
      root.querySelector('meta[name="Keywords"]')?.getAttribute('content')?.trim() ??
      '';
    // 取第一個「有文字」的 h1：有些頁面用 Elementor 產生巢狀 h1（外層空殼、內層才是標題），
    // 只抓第一個 h1 會拿到空字串，改成找第一個非空的
    const h1 =
      root
        .querySelectorAll('h1')
        .map((el) => el.text.replace(/\s+/g, ' ').trim())
        .find((t) => t) ?? '';

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
export async function fetchAllTkd(
  pages: PageRef[],
  concurrency = 6,
): Promise<PageTkd[]> {
  const results: PageTkd[] = new Array(pages.length);
  let cursor = 0;

  async function worker() {
    while (cursor < pages.length) {
      const i = cursor++;
      results[i] = await fetchPageTkd(pages[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pages.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
