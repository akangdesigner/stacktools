// 電商平台偵測 + 平台專屬頁面蒐集。
// 目的：像 91APP 這種「網址是數字 ID（/SalePage/Index/11959331）、主選單靠 JS 渲染」的站，
// 讓 AI 看網址猜型態等於閉著眼睛猜。但 91APP 的 sitemap 早就按型態分好檔
// （sitemap_ShopSalePage=產品、sitemap_ShopCategory=分類…），檔名就是型態標籤，
// 直接依子 sitemap 賦予型態，零誤判又省 OpenRouter 額度。
import { normalizeSite, prettyUrl, type PageRef } from './tkd-crawler';
import { type ClassifiedPage, type PageType } from './tkd-classify';
import { type HTMLElement } from 'node-html-parser';
import { gunzipSync } from 'node:zlib';

// 抓網頁時偽裝成瀏覽器，避免被擋（與 tkd-crawler 同一組 UA）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 偵測到的平台。只有 91app 走專屬 adapter，其餘（shopline/wordpress/generic）
// 都走 tkd-crawler 的通用流程；shopline/wordpress 目前只用於前端顯示、未來可各自做 adapter
export type Platform = '91app' | 'shopline' | 'wordpress' | 'generic';

// 平台顯示名稱（前端徽章用）
export const PLATFORM_LABEL: Record<Platform, string> = {
  '91app': '91APP',
  shopline: 'SHOPLINE',
  wordpress: 'WordPress',
  generic: '自架',
};

// 帶逾時的 fetch（預設 15 秒）
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

// 讀 sitemap 內容（gzip-aware：91APP 的子 sitemap 是 .xml.gz，fetch 不會自動解壓）
async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
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

// 從 XML 抓所有 <loc> 網址
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

// 讀 robots.txt 裡宣告的所有 Sitemap 位置
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

// 偵測平台：先探 robots.txt（91APP 指紋夠強、便宜命中就回，維持 1 次抓取），
// 非 91APP 才多抓一次首頁 HTML 認 Shopline / WordPress，最後退 generic（自架）
export async function detectPlatform(siteInput: string): Promise<Platform> {
  const site = normalizeSite(siteInput);
  let robots = '';
  try {
    const res = await fetchWithTimeout(`${site}/robots.txt`);
    if (res.ok) robots = await res.text();
  } catch {
    /* robots 抓不到就往下靠首頁 HTML 判斷 */
  }
  // 91APP 指紋：功能路徑（大量存在於 91APP 商店）＋ 帶數字店家 ID 的 Sitemap_Index 宣告
  const has91appPaths =
    /disallow:\s*\/(shoppingcart|tradesorder|vipmember|ecoupon|tracesalepage)/i.test(robots);
  const has91appSitemap = /sitemap:\s*\S*\/Sitemap\/\d+\/Sitemap_Index\.xml/i.test(robots);
  if (has91appPaths || has91appSitemap) return '91app';

  // 抓首頁 HTML 認其他平台（Shopline / WordPress 的指紋在頁面資源網址／generator）
  let html = '';
  try {
    const res = await fetchWithTimeout(site);
    if (res.ok) html = await res.text();
  } catch {
    /* 首頁抓不到就當 generic */
  }
  // Shopline：資源掛在 shoplineapp.com CDN，或 sitemap 帶 ?locale= 變體
  if (/shoplineapp\.com/i.test(html) || /sitemap:\s*\S*[?&]locale=/i.test(robots)) return 'shopline';
  // WordPress：wp-content／wp-includes 資源路徑或 generator meta（wp-admin 也是常見旁證）
  if (
    /\/wp-(content|includes)\//i.test(html) ||
    /<meta[^>]+name=["']generator["'][^>]+wordpress/i.test(html) ||
    /disallow:\s*\/wp-admin/i.test(robots)
  ) {
    return 'wordpress';
  }
  return 'generic';
}

// 91APP 子 sitemap 檔名 → 型態對應。回傳：
//   物件  = 這個子 sitemap 的頁面直接套此型態
//   'cms' = /page/ 自訂頁（促銷 or 形象混在一起，真的要判），交給 AI classifyPages
//   'skip'= 整個子 sitemap 不收集（如搜尋結果，93 個 ?q=關鍵字 純噪音）
//   'home'= 首頁 sitemap，混了網域根（首頁）與最新商品列表，逐 URL 特判
type SitemapRule = { type: PageType; include: boolean } | 'cms' | 'skip' | 'home';

function ruleForSitemap(name: string): SitemapRule {
  const n = name.toLowerCase();
  if (n.includes('shopsearchresult')) return 'skip'; // 搜尋結果頁：純噪音，直接不收
  if (n.includes('shopcmscustomizationpage')) return 'cms'; // /page/xxx：促銷或形象，交 AI 判
  if (n.includes('shophome')) return 'home'; // 首頁 + 最新商品列表，逐 URL 特判
  if (n.includes('shopsalepage')) return { type: '產品頁', include: true };
  if (n.includes('shopcategory')) return { type: '分類頁', include: true };
  if (n.includes('shopintroduce')) return { type: '形象頁', include: true };
  if (n.includes('shopinfomodulearticle')) return { type: '部落格', include: false }; // 單篇文章：依規則不收
  if (n.includes('shopinfomodulelist')) return { type: '部落格', include: true }; // 文章/影片總覽入口：收
  if (n.includes('shopinfomodulevideo')) return { type: '功能頁', include: false }; // 影片頁：列出但不收
  return 'cms'; // 未知子 sitemap 保守交 AI 判，別亂賦型態
}

// 型態排序權重：頁數超過上限時，重要型態優先保留，別被產品海／文章海淹掉
const TYPE_ORDER: Record<PageType, number> = {
  首頁: 0,
  形象頁: 1,
  分類頁: 2,
  產品頁: 3,
  部落格: 4,
  促銷: 5,
  功能頁: 6,
  其他: 7,
};

// 去錨點、去尾斜線、小寫，當去重 key（InfoModuleList#/ArticleList 等 SPA 錨點路由要去重成同一頁）
function dedupeKey(url: string): string {
  return prettyUrl(url.split('#')[0]).toLowerCase().replace(/\/+$/, '');
}

// 讀頁面裡的 JSON-LD BreadcrumbList，回傳各層名稱（含「首頁」）
function readBreadcrumb(root: HTMLElement): string[] {
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.text) as unknown;
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) {
        if (
          o &&
          typeof o === 'object' &&
          (o as Record<string, unknown>)['@type'] === 'BreadcrumbList' &&
          Array.isArray((o as Record<string, unknown>).itemListElement)
        ) {
          const items = (o as { itemListElement: Array<Record<string, unknown>> }).itemListElement;
          return items
            .map((it) => {
              const name = it.name ?? (it.item as Record<string, unknown> | undefined)?.name;
              return typeof name === 'string' ? name.trim() : '';
            })
            .filter(Boolean);
        }
      }
    } catch {
      /* 這段 ld+json 不是合法 JSON 就略過 */
    }
  }
  return [];
}

// 取 og:title（91APP 各型態的共同退路）
function ogTitle(root: HTMLElement): string {
  return root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ?? '';
}

// 91APP 頁面的 h1 是 JS 才渲染、server HTML 讀不到（產品頁是空殼、分類/文章頁連標籤都沒有）。
// 依網址型態從 server 端可讀的最佳來源還原「實際會顯示的 h1」：
//   產品頁 → og:title 去掉結尾價格（NT$3,280）
//   分類頁 → 麵包屑最後一項（當前分類名；跳過「首頁」），退 og:title 第一段
//   文章頁 → og:title（就是文章標題，即 h1）
//   其他 91APP 頁（形象/自訂頁）→ og:title
// 只在原始 <h1> 讀不到時當退路用（見 fetchPageTkd），不覆蓋真的有 h1 的頁
export function extract91appH1(root: HTMLElement, url: string): string {
  const path = url.toLowerCase();
  if (/\/salepage\/index\//.test(path)) {
    return ogTitle(root).replace(/\s*(nt)?\$[\d,.]+\s*$/i, '').trim(); // 去尾價格
  }
  if (/salepagecategory/.test(path)) {
    const bc = readBreadcrumb(root);
    const last = bc.length ? bc[bc.length - 1] : '';
    if (last && last !== '首頁') return last;
    return ogTitle(root).split(/\s*[|｜]\s*/)[0].trim(); // 退 og:title 第一段（半形/全形 | 都切）
  }
  return ogTitle(root); // 文章頁與其他型態
}

// 91APP 專屬蒐集：讀 sitemap index，依子 sitemap 直接賦予型態。
// 回傳 classified（型態已確定的頁）與 needAiClassify（/page/ 自訂頁，交呼叫端跑 AI）
export async function collect91app(
  siteInput: string,
  limit: number,
): Promise<{ classified: ClassifiedPage[]; needAiClassify: PageRef[] }> {
  const site = normalizeSite(siteInput);
  const homeRoot = site.toLowerCase().replace(/\/+$/, ''); // 網域根，用來認 ShopHome 裡的首頁

  // 找 sitemap index：優先 robots.txt 宣告裡含 Sitemap_Index 的，退第一個宣告
  const declared = await sitemapsFromRobots(site);
  const indexUrl =
    declared.find((u) => /sitemap_index\.xml/i.test(u)) ?? declared[0];
  if (!indexUrl) return { classified: [], needAiClassify: [] };

  const indexXml = await fetchSitemapText(indexUrl);
  if (!indexXml) return { classified: [], needAiClassify: [] };
  const childSitemaps = extractLocs(indexXml); // 子 sitemap 清單（.xml.gz）

  const seen = new Set<string>();
  const classified: ClassifiedPage[] = [];
  const needAiClassify: PageRef[] = [];
  const pushClassified = (url: string, type: PageType, include: boolean) => {
    const key = dedupeKey(url);
    if (seen.has(key)) return;
    seen.add(key);
    classified.push({ url: url.split('#')[0].replace(/\/+$/, ''), type, include });
  };

  for (const child of childSitemaps) {
    const rule = ruleForSitemap(child);
    if (rule === 'skip') continue;

    const xml = await fetchSitemapText(child);
    if (!xml) continue;
    const locs = extractLocs(xml);

    if (rule === 'cms') {
      // /page/xxx 自訂頁：型態待 AI 判，先收進 needAiClassify（一樣去重）
      for (const loc of locs) {
        const key = dedupeKey(loc);
        if (seen.has(key)) continue;
        seen.add(key);
        needAiClassify.push({ url: loc.split('#')[0].replace(/\/+$/, '') });
      }
    } else if (rule === 'home') {
      // ShopHome：網域根＝首頁；其餘（NewestSalePage 最新商品列表）＝分類頁
      for (const loc of locs) {
        if (dedupeKey(loc) === dedupeKey(homeRoot)) pushClassified(loc, '首頁', true);
        else pushClassified(loc, '分類頁', true);
      }
    } else {
      for (const loc of locs) pushClassified(loc, rule.type, rule.include);
    }
  }

  // 依型態重要度排序後截斷，確保上限內優先保留首頁/形象/分類/產品，噪音型態排最後
  classified.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
  return { classified: classified.slice(0, limit), needAiClassify };
}
