import { getAccessToken } from './gscAuth';
import { LEVEL, CATEGORY, type CheckResult } from './site-audit-rules';
import { normalizeUrl } from './site-audit-crawler';

// ── 網站技術健檢：GSC 官方資料層 ────────────────────────
// 用 Search Console API 把「有官方資料」的項目升級成 Google 第一手結果：
//   - 有無建立索引 / 結構化數據 (Schema) / 檢查重複內容 → 同一支 URL Inspection API 一次回傳（不多花配額）
//   - 正確提交或建立 Sitemap → Sitemaps API
// 未授權 / 找不到對應 GSC 資源時，各項回 undefined，讓上層退回爬蟲判斷。

const SC_BASE = 'https://searchconsole.googleapis.com';

// 送 URL 檢測前把網址 path 解碼：sitemap 裡的中文網址常是小寫 percent-encoded（%e5…），
// 原封送給 URL Inspection API → Google 回「無法辨識的網址」誤判未收錄；
// 解碼後（new URL 會統一成標準編碼）→ 正確回 PASS。query／解碼失敗保留原樣。
// 一定要修在這最底層：runGscChecks 的 host 改寫會把中文重新編回 %，改上游沒用。
function decodeUrlForInspect(u: string): string {
  try {
    const x = new URL(u);
    x.pathname = decodeURIComponent(x.pathname);
    return x.href;
  } catch {
    return u;
  }
}

// 列出授權帳號的 GSC 資源，找出符合此 origin 的已驗證 property（回傳其 siteUrl）
async function resolveGscProperty(origin: string, accessToken: string): Promise<string | null> {
  let host = '';
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
  const bare = host.replace(/^www\./, '');

  const res = await fetch(`${SC_BASE}/webmasters/v3/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel?: string }[] };
  const entries = (data.siteEntry ?? []).filter((e) => (e.permissionLevel ?? '') !== 'siteUnverifiedUser');

  for (const e of entries) {
    const su = e.siteUrl.toLowerCase();
    if (su === `sc-domain:${bare}`) return e.siteUrl;
    if (su === `${origin.toLowerCase()}/`) return e.siteUrl;
  }
  for (const e of entries) {
    const su = e.siteUrl.toLowerCase();
    if (su.startsWith('sc-domain:')) {
      if (su.slice('sc-domain:'.length).replace(/^www\./, '') === bare) return e.siteUrl;
    } else {
      try {
        if (new URL(e.siteUrl).host.toLowerCase().replace(/^www\./, '') === bare) return e.siteUrl;
      } catch {
        /* 略過壞的 siteUrl */
      }
    }
  }
  return null;
}

// 單次 URL 檢測回傳的資料（一次取出索引 + canonical + Google 辨識到的結構化資料）
interface InspectResult {
  url: string;
  verdict: string; // PASS＝已收錄
  coverageState: string;
  googleCanonical: string;
  userCanonical: string;
  richTypes: string[]; // Google 實際辨識到的結構化資料型別
  error: boolean;
}

// 逐一檢測網址（併發 5、保守配額）
async function inspectUrls(
  siteUrl: string,
  urls: string[],
  accessToken: string,
  onProgress?: (done: number, total: number) => void,
): Promise<InspectResult[]> {
  const out: InspectResult[] = [];
  const concurrency = 10; // URL 檢測配額 600/分，併發 10 仍安全，但能大幅縮短等待
  let done = 0;
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const rs = await Promise.all(
      batch.map(async (url): Promise<InspectResult> => {
        const inspectUrl = decodeUrlForInspect(url); // 中文網址先解碼再送，避免被判「無法辨識」
        try {
          const res = await fetch(`${SC_BASE}/v1/urlInspection/index:inspect`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inspectionUrl: inspectUrl, siteUrl, languageCode: 'zh-TW' }),
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) return { url: inspectUrl, verdict: 'ERROR', coverageState: `HTTP ${res.status}`, googleCanonical: '', userCanonical: '', richTypes: [], error: true };
          const d = (await res.json()) as {
            inspectionResult?: {
              indexStatusResult?: { verdict?: string; coverageState?: string; googleCanonical?: string; userCanonical?: string };
              richResultsResult?: { detectedItems?: { richResultType?: string }[] };
            };
          };
          const idx = d.inspectionResult?.indexStatusResult;
          const rich = d.inspectionResult?.richResultsResult?.detectedItems ?? [];
          return {
            url: inspectUrl,
            verdict: idx?.verdict ?? 'UNKNOWN',
            coverageState: idx?.coverageState ?? '',
            googleCanonical: idx?.googleCanonical ?? '',
            userCanonical: idx?.userCanonical ?? '',
            richTypes: rich.map((r) => r.richResultType ?? '').filter(Boolean),
            error: false,
          };
        } catch {
          return { url: inspectUrl, verdict: 'ERROR', coverageState: '連線失敗', googleCanonical: '', userCanonical: '', richTypes: [], error: true };
        }
      }),
    );
    out.push(...rs);
    done += batch.length;
    onProgress?.(done, urls.length);
  }
  return out;
}

// Sitemaps API：查這個資源提交了哪些 sitemap、讀取錯誤、收錄數
async function buildSitemapCheck(siteUrl: string, accessToken: string): Promise<CheckResult | null> {
  const base = { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap' };
  const res = await fetch(`${SC_BASE}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    sitemap?: { path: string; errors?: string | number; warnings?: string | number; contents?: { submitted?: string | number; indexed?: string | number }[] }[];
  };
  const list = data.sitemap ?? [];
  // 空清單「不」等於沒提交：App 帳號對某些客戶站只是受限使用者(siteRestrictedUser)、或只有
  // 網址前置版 property 而提交是掛在 sc-domain 版時，Sitemaps API 會回空清單（zeyutang 實測即如此，
  // 後台明明有提交）。此時回 null 交由上層退回爬蟲判斷「檔案是否存在」，避免誤報「未提交」。
  if (list.length === 0) return null;
  // 註：Sitemaps API 的 contents.indexed 是舊欄位、常年回 0 不可靠，故只採用「提交數」與「錯誤數」；實際收錄看「有無建立索引」那項
  let errors = 0, submitted = 0;
  for (const s of list) {
    errors += Number(s.errors ?? 0);
    for (const c of s.contents ?? []) submitted += Number(c.submitted ?? 0);
  }
  const evidence = `已提交 ${list.length} 份；網址 ${submitted}、錯誤 ${errors}`;
  return errors > 0
    ? { ...base, status: 'warn', advice: `GSC 實測：已提交 ${list.length} 份 sitemap（共 ${submitted} 個網址），但有 ${errors} 個讀取錯誤，建議修正`, evidence }
    : { ...base, status: 'ok', advice: `GSC 實測：已提交 ${list.length} 份 sitemap 至 Search Console、無讀取錯誤（共 ${submitted} 個網址）`, evidence };
}

// 由 URL 檢測結果組「有無建立索引」
function buildIndexingCheck(results: InspectResult[], sitemapTotal: number): CheckResult | null {
  const base = { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有無建立索引' };
  const valid = results.filter((r) => !r.error);
  if (valid.length === 0) return null;
  const indexed = valid.filter((r) => r.verdict === 'PASS').length;
  const notIndexed = valid.filter((r) => r.verdict !== 'PASS');
  const reasons = new Map<string, number>();
  for (const r of notIndexed) reasons.set(r.coverageState || '未知原因', (reasons.get(r.coverageState || '未知原因') ?? 0) + 1);
  const reasonText = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、');
  const scopeNote = sitemapTotal > valid.length ? `（sitemap 共 ${sitemapTotal} 頁，跨站抽樣 ${valid.length} 頁估算收錄率）` : `（共 ${valid.length} 頁）`;
  const evidence = `GSC：已收錄 ${indexed}/${valid.length}`;
  if (notIndexed.length === 0) return { ...base, status: 'ok', advice: `GSC 實測：抽查 ${valid.length} 頁全部已收錄${scopeNote}`, evidence };
  const status: CheckResult['status'] = notIndexed.length > valid.length * 0.3 ? 'fail' : 'warn';
  // 明細：逐頁列出未收錄的網址與 Google 給的原因（coverageState）
  const details = notIndexed.map((r) => ({ url: r.url, note: r.coverageState || '未收錄' }));
  return { ...base, status, advice: `GSC 實測：${valid.length} 頁中 ${indexed} 頁已收錄、${notIndexed.length} 頁未收錄${reasonText ? `（${reasonText}）` : ''}${scopeNote}，建議檢查未收錄頁面`, evidence, details };
}

// 由 URL 檢測結果組「結構化數據 (Schema)」（Google 實際辨識到的型別）
function buildSchemaCheck(results: InspectResult[]): CheckResult | null {
  const base = { key: 'schema', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '結構化數據 (Schema)' };
  const valid = results.filter((r) => !r.error);
  if (valid.length === 0) return null;
  const typeCount = new Map<string, number>();
  for (const r of valid) for (const t of r.richTypes) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  const types = [...typeCount.entries()].sort((a, b) => b[1] - a[1]);
  if (types.length === 0) {
    return { ...base, status: 'fail', advice: `GSC 實測：抽查 ${valid.length} 頁，Google 未辨識到任何結構化資料，建議部署 Product / Article / BreadcrumbList 等 Schema`, evidence: `檢測 ${valid.length} 頁、0 型別` };
  }
  return { ...base, status: 'warn', advice: `GSC 實測：Google 辨識到 ${types.map(([t, n]) => `${t}×${n}`).join('、')}（抽查 ${valid.length} 頁），型別完整度與缺漏建議人工複核`, evidence: types.map(([t, n]) => `${t}×${n}`).join('、') };
}

// 由 URL 檢測結果組「檢查重複內容」（Google 選的 canonical vs 你設的 canonical）
function buildDuplicateCheck(results: InspectResult[]): CheckResult | null {
  const base = { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '檢查重複內容' };
  const valid = results.filter((r) => !r.error);
  if (valid.length === 0) return null;
  // Google 把 canonical 指到「其他網址」＝這頁被視為某頁的重複（最直接的重複內容訊號）
  const dup = valid.filter((r) => r.googleCanonical && normalizeUrl(r.googleCanonical) !== normalizeUrl(r.url));
  if (dup.length > 0) {
    const samples = dup.slice(0, 3).map((r) => {
      try {
        return new URL(r.url).pathname || '/';
      } catch {
        return r.url;
      }
    });
    // 明細：逐頁列出被視為重複的網址與 Google 選定的 canonical
    const details = dup.map((r) => ({ url: r.url, note: `Google canonical 指向：${r.googleCanonical}` }));
    return { ...base, status: 'warn', advice: `GSC 實測：${dup.length}/${valid.length} 頁 Google 認定 canonical 指向其他網址（視為重複內容），例如：${samples.join('、')}，建議確認是否刻意合併`, evidence: `${dup.length}/${valid.length} 頁被視為重複`, details };
  }
  return { ...base, status: 'ok', advice: `GSC 實測：抽查 ${valid.length} 頁 Google 皆以自身為 canonical，未發現重複內容`, evidence: `${valid.length} 頁無重複` };
}

// 孤島交叉核對：對「疑似孤島」清單逐一問 GSC，回傳其中「已收錄」的網址集合（用來剔除假孤島，如主選單頁）
export async function filterIndexedByGsc(
  origin: string,
  urls: string[],
  cap = 80,
  onProgress?: (done: number, total: number) => void,
): Promise<{ indexed: Set<string>; checkedCount: number; unavailable: boolean }> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return { indexed: new Set(), checkedCount: 0, unavailable: true };
  }
  const property = await resolveGscProperty(origin, accessToken);
  if (!property) return { indexed: new Set(), checkedCount: 0, unavailable: true };

  const propOrigin = property.startsWith('sc-domain:') ? null : property.replace(/\/$/, '');
  const slice = urls.slice(0, cap);
  const targets = slice.map((u) => {
    if (!propOrigin) return u;
    try {
      const x = new URL(u);
      const p = new URL(propOrigin);
      x.protocol = p.protocol;
      x.host = p.host;
      return x.href;
    } catch {
      return u;
    }
  });
  const insp = await inspectUrls(property, targets, accessToken, onProgress);
  const indexed = new Set<string>();
  insp.forEach((r, i) => {
    if (r.verdict === 'PASS') indexed.add(slice[i]); // 對回原始網址
  });
  return { indexed, checkedCount: insp.filter((r) => !r.error).length, unavailable: false };
}

export interface GscChecks {
  indexing?: CheckResult;
  schema?: CheckResult;
  duplicate?: CheckResult;
  sitemap?: CheckResult;
}

// GSC 官方資料總入口：依 stage 需要哪些項目，才去打對應 API
export async function runGscChecks(
  origin: string,
  sitemapUrls: string[],
  cap: number,
  need: { indexing: boolean; schema: boolean; duplicate: boolean; sitemap: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<GscChecks> {
  if (!need.indexing && !need.schema && !need.duplicate && !need.sitemap) return {};

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return {}; // 未授權 → 全部退回爬蟲判斷
  }
  const property = await resolveGscProperty(origin, accessToken);
  if (!property) return {};

  const result: GscChecks = {};

  // Sitemaps API（便宜，1 支呼叫）
  if (need.sitemap) {
    try {
      const c = await buildSitemapCheck(property, accessToken);
      if (c) result.sitemap = c;
    } catch {
      /* 退回爬蟲 */
    }
  }

  // URL 檢測（一次回傳索引 + Schema + canonical）
  if ((need.indexing || need.schema || need.duplicate) && sitemapUrls.length > 0) {
    const propOrigin = property.startsWith('sc-domain:') ? null : property.replace(/\/$/, '');
    // 跨整份 sitemap 平均抽樣，避免偏向第一份子 sitemap（例如全是部落格頁）
    const stride = Math.max(1, Math.ceil(sitemapUrls.length / cap));
    const sampled = sitemapUrls.filter((_, i) => i % stride === 0).slice(0, cap);
    const targets = sampled.map((u) => {
      if (!propOrigin) return u;
      try {
        const x = new URL(u);
        const p = new URL(propOrigin);
        x.protocol = p.protocol;
        x.host = p.host;
        return x.href;
      } catch {
        return u;
      }
    });
    const insp = await inspectUrls(property, targets, accessToken, onProgress);
    if (need.indexing) result.indexing = buildIndexingCheck(insp, sitemapUrls.length) ?? undefined;
    if (need.schema) result.schema = buildSchemaCheck(insp) ?? undefined;
    if (need.duplicate) result.duplicate = buildDuplicateCheck(insp) ?? undefined;
  }

  return result;
}

// ── Search Analytics（搜尋成效）：給 llms.txt 產生器排序與豐富描述用 ──────
// 一次 query 拿近 90 天各頁的點擊/曝光/平均排名與熱門搜尋詞。
// 未授權 / 找不到 property / 無資料時回空 Map，讓上層照常用純爬蟲結果。

export interface PageSearchStat {
  clicks: number;
  impressions: number;
  position: number;     // 依曝光加權的平均排名
  topQueries: string[]; // 依曝光排序的前幾個搜尋詞
}

// 回傳同時帶 property 名稱，讓前端能即時回饋「有沒有找到 GSC 資源」
export interface PageStatsResult {
  property: string | null;             // 找到的 GSC property（sc-domain:xxx 或網址）；null＝沒授權/找不到
  stats: Map<string, PageSearchStat>;  // 各頁搜尋成效（找不到或無資料時為空 Map）
}

export async function fetchPageSearchStats(origin: string): Promise<PageStatsResult> {
  const empty = new Map<string, PageSearchStat>();

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return { property: null, stats: empty }; // 未授權 → 退回純爬蟲
  }
  const property = await resolveGscProperty(origin, accessToken);
  if (!property) return { property: null, stats: empty }; // 這個網域不在授權帳號的 GSC 資源裡

  // 近 90 天（GSC 有 2～3 天延遲，直接用今天往前算，API 會回實際有的資料）
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  interface Row {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    position?: number;
  }
  let rows: Row[] = [];
  try {
    const res = await fetch(`${SC_BASE}/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      // page×query 兩維度一次撈，程式端再依頁彙整（省一次呼叫）
      body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ['page', 'query'], rowLimit: 5000 }),
    });
    if (!res.ok) return { property, stats: empty }; // property 有找到、只是查詢失敗
    const data = (await res.json()) as { rows?: Row[] };
    rows = data.rows ?? [];
  } catch {
    return { property, stats: empty };
  }

  // 依「正規化後網址」彙整：加總點擊/曝光、依曝光加權算平均排名、蒐集搜尋詞
  const acc = new Map<
    string,
    { clicks: number; impressions: number; posWsum: number; queries: { q: string; impressions: number }[] }
  >();
  for (const r of rows) {
    const page = r.keys?.[0];
    if (!page) continue;
    const query = r.keys?.[1] ?? '';
    const impressions = r.impressions ?? 0;
    let key: string;
    try {
      key = normalizeUrl(page);
    } catch {
      continue;
    }
    let e = acc.get(key);
    if (!e) {
      e = { clicks: 0, impressions: 0, posWsum: 0, queries: [] };
      acc.set(key, e);
    }
    e.clicks += r.clicks ?? 0;
    e.impressions += impressions;
    e.posWsum += (r.position ?? 0) * impressions;
    if (query) e.queries.push({ q: query, impressions });
  }

  const out = new Map<string, PageSearchStat>();
  for (const [key, e] of acc) {
    const topQueries = e.queries
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3)
      .map((x) => x.q);
    out.set(key, {
      clicks: e.clicks,
      impressions: e.impressions,
      position: e.impressions > 0 ? e.posWsum / e.impressions : 0,
      topQueries,
    });
  }
  return { property, stats: out };
}
