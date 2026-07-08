import { gunzipSync } from 'zlib';
import { parse } from 'node-html-parser';
import { normalizeUrl, type CrawlResult, type PageFacts } from './site-audit-crawler';
import type { PageSearchStat } from './site-audit-gsc';

// ── llms.txt 產生器 ─────────────────────────────────────
// 複用 site-audit 的全站爬蟲結果（CrawlResult），把每頁的 title / description 整理成
// 符合 llmstxt.org 格式的 llms.txt：一個 H1 站名、一段 blockquote 摘要，再依網址第一層
// 路徑分區塊列出各頁連結。描述直接用爬到的 meta description，不呼叫 AI。
// 另可帶入 GSC 搜尋成效（PageSearchStat）：依曝光排序把重要頁排前面，並用熱門搜尋詞
// 補上「沒有 meta description」的頁的描述。沒授權/沒數據就自動略過，維持純爬結果。

// 產生結果（給前端顯示用）
export interface LlmsResult {
  content: string;      // 完整 llms.txt 文字
  pageCount: number;    // 實際收錄的頁數
  llmsExists: boolean;  // 該站是否已經有 llms.txt
  usedGsc: boolean;     // 是否有套用 GSC 搜尋成效
  curated: boolean;     // 是否為 AI 策展版（false＝規則版 fallback）
}

// 把多行／多空白的文字壓成單行：meta description 常含換行，直接放進 markdown 連結會斷行破格
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// 功能頁／系統頁的路徑片段（購物車、結帳、登入、會員、收藏、搜尋…），這些不該進 llms.txt。
// 用「路徑片段完全比對」避免誤傷內容頁；含 91APP 常見系統路徑（V2/ShoppingCart/TraceSalePageList）。
// 注意：不能把 91APP 的 v2 前綴整段排除——正常內容頁（分類/商品）就在 /v2/official/... 底下；
// 購物車靠 shoppingcart 片段命中即可。
const FUNC_SEG =
  /^(cart|shoppingcart|checkout|login|logout|signin|signup|register|member|members|account|myaccount|profile|wishlist|favorite|favorites|tracesalepagelist|tracesalepage|search|searchresult|compare|order|orders|orderlist|orderquery|coupon|point|points|notify|notification|redirect|cs|servicecenter|customerservice)$/i;

// 判斷是不是功能頁／系統頁（任一路徑片段命中排除清單即是）
function isFunctionalPage(url: string): boolean {
  try {
    return new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .some((seg) => FUNC_SEG.test(decodeURIComponent(seg)));
  } catch {
    return false;
  }
}

// 取網址第一層路徑當分區名稱（無路徑＝首頁層，歸到「主要頁面」）
function sectionOf(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    if (!seg) return '主要頁面';
    // 路徑片段做 Title Case，破折號/底線換空白，讓區塊標題好讀
    return decodeURIComponent(seg)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return '其他';
  }
}

// 連結顯示文字：優先用 title，沒有就用路徑末段，再沒有就用網址
function linkText(p: PageFacts): string {
  if (p.title.trim()) return p.title.trim();
  try {
    const seg = new URL(p.url).pathname.split('/').filter(Boolean).pop();
    if (seg) return decodeURIComponent(seg);
  } catch {
    /* 網址解析失敗就往下用整條網址 */
  }
  return p.url;
}

// 把爬蟲結果組成 llms.txt 文字；stats 有值時套用 GSC 搜尋成效（排序＋描述補強）
export function buildLlmsTxt(crawl: CrawlResult, stats?: Map<string, PageSearchStat>): LlmsResult {
  const usedGsc = !!stats && stats.size > 0;

  // 查某頁的 GSC 成效（用正規化網址對應）
  const statOf = (p: PageFacts): PageSearchStat | undefined => {
    if (!stats) return undefined;
    try {
      return stats.get(normalizeUrl(p.url));
    } catch {
      return undefined;
    }
  };

  // 只收「可正常存取、允許索引、且非功能頁」的頁：noindex/4xx/5xx 與購物車等系統頁不該推薦給 LLM
  const pages = crawl.pages.filter((p) => p.ok && !p.noindex && !isFunctionalPage(p.url));

  const home = pages.find((p) => p.isHome) ?? pages[0];
  const host = (() => {
    try {
      return new URL(crawl.origin).hostname;
    } catch {
      return crawl.origin;
    }
  })();

  // 標題：首頁 title 優先，退回網域名
  const siteTitle = home?.title.trim() || host;
  // 摘要：首頁 meta description（壓成單行，避免 blockquote 斷成多行）
  const summary = oneLine(home?.description || '');

  const lines: string[] = [];
  lines.push(`# ${siteTitle}`);
  lines.push('');
  if (summary) {
    lines.push(`> ${summary}`);
    lines.push('');
  }

  // 依分區彙整，首頁放最前面的「主要頁面」區塊
  const groups = new Map<string, PageFacts[]>();
  for (const p of pages) {
    const key = sectionOf(p.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // 「主要頁面」排最前，其餘依區塊名排序
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === '主要頁面') return -1;
    if (b === '主要頁面') return 1;
    return a.localeCompare(b);
  });

  // 連結後面的描述：優先用 meta description，沒有才用 GSC 熱門搜尋詞補
  const descLine = (p: PageFacts): string => {
    const meta = oneLine(p.description);
    if (meta) return `: ${meta}`;
    const q = statOf(p)?.topQueries ?? [];
    if (q.length) return `: 相關搜尋：${q.join('、')}`;
    return '';
  };

  for (const key of sortedKeys) {
    // 區塊內依 GSC 曝光排序（重要頁在前），沒數據的排後面、同分再依網址
    const items = groups.get(key)!.slice().sort((a, b) => {
      const ia = statOf(a)?.impressions ?? 0;
      const ib = statOf(b)?.impressions ?? 0;
      if (ib !== ia) return ib - ia;
      return a.url.localeCompare(b.url);
    });
    lines.push(`## ${key}`);
    lines.push('');
    for (const p of items) {
      lines.push(`- [${linkText(p)}](${p.url})${descLine(p)}`);
    }
    lines.push('');
  }

  return {
    content: lines.join('\n').trimEnd() + '\n',
    pageCount: pages.length,
    llmsExists: crawl.llmsExists,
    usedGsc,
    curated: false, // 規則版
  };
}

// ── sitemap 補頁 ────────────────────────────────────────
// 91APP 等「首頁選單走 JS」的站，BFS 爬蟲點不進去，產品/分類頁抓不到。
// 但爬蟲已抓下 sitemap.xml 全部網址（crawl.sitemapUrls），這裡把「爬不到但 sitemap 有」的頁
// 補抓 title/description 補進來。同樣濾掉功能頁，並發 8、上限 300 頁避免超大站爆掉。

const MAX_SUPPLEMENT = 300;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

// 網址正規化的安全包裝（失敗回 null）
function safeNorm(u: string): string | null {
  try {
    return normalizeUrl(u);
  } catch {
    return null;
  }
}

// 只填 buildLlmsTxt 會讀到的欄位，其餘給預設，湊成完整 PageFacts
function makeFacts(p: { url: string; title: string; description: string; noindex: boolean; status: number }): PageFacts {
  return {
    url: p.url,
    depth: 1,
    ok: true,
    status: p.status,
    title: p.title,
    description: p.description,
    h1: 0,
    h2: 0,
    imgTotal: 0,
    imgAltEmpty: 0,
    imgAltEmptyNames: [],
    imgLegacy: 0,
    jsonLdTypes: [],
    hasBreadcrumb: false,
    canonical: '',
    noindex: p.noindex,
    hasViewport: false,
    analytics: [],
    internalLinks: [],
    externalCount: 0,
    isHome: false,
    mainText: '',
  };
}

// 補抓單頁的 title / description / noindex（只要 llms.txt 需要的欄位）
async function fetchPageMeta(url: string): Promise<PageFacts | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('html')) return null;
    const root = parse(await res.text());
    const title = root.querySelector('title')?.text?.trim() || '';
    const description = root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
    const robots = (root.querySelector('meta[name="robots"]')?.getAttribute('content') || '').toLowerCase();
    return makeFacts({ url, title, description, noindex: robots.includes('noindex'), status: res.status });
  } catch {
    return null; // 單頁失敗就跳過，不影響整體
  }
}

// 抓一份 sitemap 的文字：偵測 gzip magic bytes（0x1f 0x8b）就先解壓（91APP 子 sitemap 是 .xml.gz）
async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      try {
        return gunzipSync(buf).toString('utf-8');
      } catch {
        return null; // 壞的 gzip 就跳過
      }
    }
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

// 自己找出全站 sitemap 裡的頁面網址：先讀 robots.txt 的 Sitemap 指令（m2 這類站的 sitemap 不在
// 標準 /sitemap.xml），再 fallback 標準位置；支援 sitemapindex 巢狀與 gzip。不動 site-audit 的 crawler。
async function resolveSitemapUrls(origin: string): Promise<string[]> {
  const starts: string[] = [];
  // robots.txt 的 Sitemap: 指令（可能有多個）
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 8000);
    if (res.ok) {
      const txt = await res.text();
      for (const m of txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)) starts.push(m[1].trim());
    }
  } catch {
    /* 沒 robots 就只靠標準位置 */
  }
  starts.push(`${origin}/sitemap.xml`); // fallback

  const seenSm = new Set<string>();
  const queue = [...starts];
  const out = new Set<string>();
  let fetched = 0;
  // 最多抓 30 份 sitemap、2000 個網址，與 crawler 的上限一致
  while (queue.length && out.size < 2000 && fetched < 30) {
    const sm = queue.shift()!;
    if (seenSm.has(sm)) continue;
    seenSm.add(sm);
    fetched++;
    const xml = await fetchSitemapText(sm);
    if (!xml) continue;
    const isIndex = /<sitemapindex/i.test(xml);
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const loc = m[1].trim();
      if (isIndex) queue.push(loc); // 巢狀 index → 繼續往下抓子 sitemap
      else out.add(loc);
    }
  }
  return [...out];
}

// 從 sitemap 補抓「爬不到」的頁；回傳補到的 PageFacts。onProgress 回報補抓進度與總數（含被截斷的量）
export async function supplementFromSitemap(
  crawl: CrawlResult,
  onProgress?: (done: number, total: number, capped: number) => void,
): Promise<PageFacts[]> {
  // 已爬到的正規化網址（用來剔除 sitemap 裡重複的）
  const seen = new Set<string>();
  for (const p of crawl.pages) {
    const k = safeNorm(p.url);
    if (k) seen.add(k);
  }

  // 自己解析 sitemap（讀 robots + gzip），再併上 crawler 已抓到的，去重
  const sitemapUrls = [...new Set([...(await resolveSitemapUrls(crawl.origin)), ...crawl.sitemapUrls])];

  const candidates: string[] = [];
  for (const u of sitemapUrls) {
    if (isFunctionalPage(u)) continue;
    const k = safeNorm(u);
    if (!k || seen.has(k)) continue;
    seen.add(k); // 兼作 sitemap 內去重
    candidates.push(u);
  }

  const targets = candidates.slice(0, MAX_SUPPLEMENT);
  const capped = candidates.length - targets.length; // 超過上限被丟掉的量（給上層提示，不靜默截斷）

  const out: PageFacts[] = [];
  const CONC = 8;
  let done = 0;
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC);
    const facts = await Promise.all(batch.map(fetchPageMeta));
    for (const f of facts) if (f && !f.noindex) out.push(f);
    done += batch.length;
    onProgress?.(done, targets.length, capped);
  }
  return out;
}

// ── AI 策展 ─────────────────────────────────────────────
// llms.txt 是「策展」不是「全站傾倒」：要語意分類、精選 50～100 條、商品規格收斂、排掉活動頁。
// 純規則做不到語意判斷，這裡把候選頁丟 Claude（走 OpenRouter，與 site-audit/TKD 同一套）做策展。
// 沒 API key 或失敗時，上層退回規則版 buildLlmsTxt，不讓整支炸掉。

const CURATE_MODEL = 'anthropic/claude-haiku-4.5';

// 蒐集策展候選：濾功能頁/noindex/無標題，依 GSC 曝光排序、去重標題，取前 180 條控制 AI input
interface Candidate {
  url: string;
  title: string;
  impressions: number;
}
function collectCandidates(crawl: CrawlResult, stats?: Map<string, PageSearchStat>): Candidate[] {
  const impOf = (u: string): number => {
    const k = safeNorm(u);
    return (k && stats?.get(k)?.impressions) || 0;
  };
  const list: Candidate[] = [];
  for (const p of crawl.pages) {
    if (!p.ok || p.noindex || isFunctionalPage(p.url)) continue;
    const title = oneLine(p.title);
    if (!title) continue; // 沒標題的頁對策展沒意義
    list.push({ url: p.url, title, impressions: impOf(p.url) });
  }
  list.sort((a, b) => b.impressions - a.impressions);
  // 去掉完全相同標題（保留曝光最高那條），再取前 180
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    if (seen.has(c.title)) continue;
    seen.add(c.title);
    out.push(c);
  }
  return out.slice(0, 180);
}

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools llms.txt',
    },
    // max_tokens 一定要設，否則 OpenRouter 用模型上限預扣、餘額不足時每次 402（TKD 踩過）
    body: JSON.stringify({ model: CURATE_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 6000, temperature: 0.3 }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildCuratePrompt(siteTitle: string, candidates: Candidate[]): string {
  // 每頁一個編號，AI 只回編號（id），不碰網址，從根本杜絕杜撰 url
  const listing = candidates.map((c, i) => `${i + 1}. ${c.title}（曝光${c.impressions}） ${c.url}`).join('\n');
  return `你是資深 GEO/AIO（生成式引擎優化）與 AI 內容策略顧問。以下是「${siteTitle}」網站爬取到的頁面清單，每行格式為「編號. 標題（曝光量） 網址」。
請整理成一份「AI 友善」、符合最佳實務的 llms.txt。重點是策展（精選＋分類＋建立品牌語意），不是把全部列出。

【最重要的規則】
- 要收錄某一頁時，用它的「編號」（id），**絕對不要輸出網址**。網址由系統依編號自動填入。只能使用清單中真實出現過的編號，不可捏造編號。

【通用規則】
- 精選：全部連結加起來控制在 50～100 條，曝光量高、代表性強的優先。
- 商品收斂：同一產品的不同規格/組合（買一送一、三盒組、優惠價、加購…）只留一條，用最精簡核心產品名（例：「超能膠原飲」）。
- 排除：時效性活動/促銷頁（母親節、雙11、購物節、週年慶、團購…）、SKU 規格變體、購物車/會員/搜尋等功能頁、重複或空白頁。
- name 用精簡好讀的中文名。

【要產出的區塊】
- summary：一句話網站介紹。
- language / primaryLanguage：語言代碼與名稱（依內容判斷，例 "zh-TW" / "Traditional Chinese"）。
- about：2～4 句品牌介紹，說明這個品牌/網站在做什麼。
- keyProducts：主要產品或核心成分的純文字條列（3～6 個，例：膠原蛋白、神經醯胺、玻尿酸、代謝保養）。
- brandTopics：品牌涵蓋的主題（給 AI 建立知識圖譜用，純文字）。primary＝最核心 6～8 個，secondary＝延伸 4～6 個。
- recommendedReading：最重要、最該先讀的 3～5 篇內容（通常是攻略/知識文章），會被標星呈現。用 id＋name。
- sections：其餘語意分區，title 一律用英文標準標籤，只用這些且依此順序：
    "Product Categories"（產品分類/系列的入口頁，例如「膠原系列」「保濕系列」「代謝系列」這類分類頁，用分類名）、
    "Featured Products"（代表性的單一商品，精選 6～10 個核心商品，用精簡商品名，例：超能膠原飲）、
    "Knowledge Guides"（知識/攻略文章）、"FAQ"（常見問題/客服頁）、"Policies"（隱私權/服務條款/退換貨等政策頁）、"Contact"（聯絡方式/門市）。
    每個 section 的 items 用 id＋name。已放進 recommendedReading 的就不要在 sections 重複。
    分區重點（很重要）：
      1. 「分類/系列頁」放 Product Categories；「單一商品頁」放 Featured Products。同一個主題不要在兩區重複（例如膠原：Product Categories 放「膠原系列」分類入口，Featured Products 放具體商品「超能膠原飲」，兩邊不要都是一堆膠原）。
      2. Featured Products 中同一個商品只收一次——就算它有多個網址或規格頁（不同編號指向同商品），也只留最具代表性的一個。
      3. 某個 section 若找不到明確符合的頁面，就整個省略該 section，絕不硬湊不相關的頁（例如把商品或分類塞進 Policies / Contact / FAQ）。寧缺勿濫。

頁面清單：
${listing}

只回傳 JSON（繁體中文內容、不要任何說明文字或 markdown 圍欄），格式：
{"summary":"...","language":"zh-TW","primaryLanguage":"Traditional Chinese","about":"...","keyProducts":["..."],"brandTopics":{"primary":["..."],"secondary":["..."]},"recommendedReading":[{"id":12,"name":"..."}],"sections":[{"title":"Products","items":[{"id":3,"name":"..."}]}]}`;
}

interface CuratedItem {
  id?: number;   // 對應頁面清單的編號（用編號而非網址，避免 AI 杜撰 url）
  name?: string;
}
interface CuratedSection {
  title?: string;
  items?: CuratedItem[];
}
interface CuratedJson {
  summary?: string;
  language?: string;         // 如 zh-TW
  primaryLanguage?: string;  // 如 Traditional Chinese
  about?: string;            // 一段品牌介紹（2～4 句）
  keyProducts?: string[];    // 主要產品/成分（純文字條列）
  brandTopics?: { primary?: string[]; secondary?: string[] }; // 品牌主題（GEO 用，AI 歸納、不綁網址）
  recommendedReading?: CuratedItem[]; // 最重要的幾篇內容（標 ⭐）
  sections?: CuratedSection[];        // 其餘語意分區（英文標籤）
}

// 從 AI 回覆容錯取出 JSON（可能夾 ```json 或前後文字）
function parseCurated(text: string): CuratedJson | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as CuratedJson;
  } catch {
    return null;
  }
}

// llms.txt 策展版主入口：規則預篩 → AI 策展 → 組檔；任何一步不成就退回規則版 buildLlmsTxt
export async function curateLlmsTxt(crawl: CrawlResult, stats?: Map<string, PageSearchStat>): Promise<LlmsResult> {
  const ruleVersion = () => buildLlmsTxt(crawl, stats); // fallback

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return ruleVersion();

  const candidates = collectCandidates(crawl, stats);
  if (candidates.length < 3) return ruleVersion(); // 頁太少，策展沒意義

  const home = crawl.pages.find((p) => p.isHome) ?? crawl.pages[0];
  const siteTitle = oneLine(home?.title || '') || (() => {
    try {
      return new URL(crawl.origin).hostname;
    } catch {
      return crawl.origin;
    }
  })();

  let parsed: CuratedJson | null;
  try {
    parsed = parseCurated(await askOpenRouter(buildCuratePrompt(siteTitle, candidates), apiKey));
  } catch {
    return ruleVersion(); // 呼叫失敗（含 402 餘額不足）→ 規則版
  }
  if (!parsed) return ruleVersion();

  // 把 AI 回的編號（id）映射回真實網址（AI 不碰 url，無從杜撰）；驗證編號有效、去重
  const usedUrls = new Set<string>();
  const toItems = (arr?: CuratedItem[]): { name: string; url: string }[] =>
    (arr ?? [])
      .map((it) => {
        const c = typeof it.id === 'number' && it.id >= 1 && it.id <= candidates.length ? candidates[it.id - 1] : undefined;
        const name = oneLine(it.name || '');
        return c && name && !usedUrls.has(c.url) ? { name, url: c.url } : null;
      })
      .filter((x): x is { name: string; url: string } => {
        if (x) usedUrls.add(x.url);
        return x !== null;
      });

  const lines: string[] = [`# ${siteTitle}`, ''];

  // ⑥ Metadata 區塊
  const now = new Date();
  const updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  lines.push('Version: 1.0');
  lines.push(`Language: ${oneLine(parsed.language || '') || 'zh-TW'}`);
  if (parsed.primaryLanguage) lines.push(`Primary Language: ${oneLine(parsed.primaryLanguage)}`);
  lines.push(`Website: ${crawl.origin}`);
  lines.push(`Updated: ${updated}`);
  lines.push('');

  // summary（blockquote）
  const summary = oneLine(parsed.summary || '');
  if (summary) lines.push(`> ${summary}`, '');

  // ③ About（品牌介紹段＋主要產品條列）
  const about = oneLine(parsed.about || '');
  const keyProducts = (parsed.keyProducts ?? []).map((s) => oneLine(s)).filter(Boolean);
  if (about || keyProducts.length) {
    lines.push('## About', '');
    if (about) lines.push(about, '');
    if (keyProducts.length) {
      lines.push('主要產品：');
      for (const p of keyProducts) lines.push(`- ${p}`);
      lines.push('');
    }
  }

  let count = 0; // 連結數（判斷策展是否有效）

  // 一個 section 的組裝
  const pushSection = (title: string, items: { name: string; url: string }[], star = false) => {
    if (items.length === 0) return;
    lines.push(`## ${title}`, '');
    for (const it of items) {
      lines.push(`- ${star ? '⭐ ' : ''}[${it.name}](${it.url})`);
      count++;
    }
    lines.push('');
  };

  // ⑤ Recommended Reading（標星，放前面凸顯優先序）
  pushSection('Recommended Reading', toItems(parsed.recommendedReading), true);

  // ①② 其餘語意分區：用固定英文標籤與順序，AI 回的依此排序
  const ORDER = ['Product Categories', 'Featured Products', 'Knowledge Guides', 'FAQ', 'Policies', 'Contact'];
  const rank = (t: string) => {
    const i = ORDER.indexOf(t);
    return i === -1 ? ORDER.length : i;
  };
  const sections = [...(parsed.sections ?? [])]
    .map((s) => ({ title: oneLine(s.title || ''), items: toItems(s.items) }))
    .filter((s) => s.title && s.items.length)
    .sort((a, b) => rank(a.title) - rank(b.title));
  for (const s of sections) pushSection(s.title, s.items);

  // Brand Topics（GEO 區塊：AI 歸納的主題，純文字不綁網址）
  const primary = (parsed.brandTopics?.primary ?? []).map((s) => oneLine(s)).filter(Boolean);
  const secondary = (parsed.brandTopics?.secondary ?? []).map((s) => oneLine(s)).filter(Boolean);
  if (primary.length || secondary.length) {
    lines.push('## Brand Topics', '');
    if (primary.length) {
      lines.push('Primary Topics:');
      for (const t of primary) lines.push(`- ${t}`);
      lines.push('');
    }
    if (secondary.length) {
      lines.push('Secondary Topics:');
      for (const t of secondary) lines.push(`- ${t}`);
      lines.push('');
    }
  }

  if (count < 3) return ruleVersion(); // 策展結果幾乎沒連結 → 退規則版

  return {
    content: lines.join('\n').trimEnd() + '\n',
    pageCount: count,
    llmsExists: crawl.llmsExists,
    usedGsc: !!stats && stats.size > 0,
    curated: true,
  };
}

// ── 背景 job 存放（module 內 in-memory Map）──────────────
// 全站爬取較久，改成背景 job：route 開 job 後立即回 jobId，爬蟲/產生在背景跑並更新進度，
// 前端輪詢拿進度與結果。Zeabur 是常駐 Node，背景 async 會持續執行。

export type LlmsJobStatus = 'checking-gsc' | 'crawling' | 'supplementing' | 'building' | 'completed' | 'failed';

// GSC 查詢結果（爬蟲前先查，讓前端即時回饋有沒有找到 GSC 資源）
export interface LlmsGscInfo {
  found: boolean;
  property?: string; // 找到的 GSC property 名稱
  pages: number;     // 有搜尋數據的頁數
}

export interface LlmsJob {
  id: string;
  url: string;
  status: LlmsJobStatus;
  message: string;
  progress: { crawled: number; discovered: number; cap: number };
  gsc?: LlmsGscInfo;
  result?: LlmsResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// 掛在 globalThis：Next.js dev 熱重載會重編譯本 module、重建一般的 module 變數，
// 進行中的 job 就會消失導致輪詢 404。掛到 global 才能跨重編譯保留（正式環境也無害）。
const g = globalThis as unknown as { __llmsJobs?: Map<string, LlmsJob> };
const jobs: Map<string, LlmsJob> = g.__llmsJobs ?? (g.__llmsJobs = new Map());
const TTL = 60 * 60 * 1000; // 1 小時後清掉舊 job，避免記憶體累積

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL) jobs.delete(id);
  }
}

export function createLlmsJob(url: string): LlmsJob {
  sweep();
  const now = Date.now();
  const id = `llms_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: LlmsJob = {
    id,
    url,
    status: 'checking-gsc',
    message: '查詢 GSC 授權…',
    progress: { crawled: 0, discovered: 0, cap: 300 },
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

export function updateLlmsJob(id: string, patch: Partial<Omit<LlmsJob, 'id' | 'createdAt'>>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getLlmsJob(id: string): LlmsJob | undefined {
  return jobs.get(id);
}
