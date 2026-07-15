import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';

// ── 網站技術健檢：規則判斷層 ────────────────────────────
// 吃「單頁 HTML 字串」，用規則逐項判斷，回傳每個指標的結果。
// 輸出欄位對齊「網站技術優化進度」那張表：影響層級 / 分類 / 狀態 / 確認事項 / SEO 建議事項。
// 這一層刻意不碰網路（不 fetch），純函式方便單獨測試。
// 需要語意判斷的項目（Schema 內容夠不夠、E-E-A-T）交給 site-audit-ai.ts。

// 影響層級（對齊表上原文寫法）
export const LEVEL = {
  RANK: '直接影響收錄 / 排名',
  EFFICIENCY: '影響效率 / 放大成效',
  QUALITY: '品質優化 / 中長期',
} as const;

// 分類（對齊表上原文）
export const CATEGORY = {
  TRACKING: '成效與追蹤',
  TECH: '技術面',
  LOCAL_BRAND: '在地與品牌',
  STRUCTURE: '網站結構',
  CONTENT: '內容與頁面',
  EXTERNAL: '外部權重',
} as const;

// 檢查結果的狀態：🟢正常 / 🟡可優化 / 🔴需處理
export type CheckStatus = 'ok' | 'warn' | 'fail';

// 兩階段（對齊進度表的兩份報告）
export const STAGE_LABEL: Record<number, string> = {
  1: '報告1：網站 SEO 基礎健檢與可行性評估',
  2: '報告2：SEO 結構與內容優化規劃',
};

// 進度表項目的權威順序與階段（key → 次序、階段）；用來排序＋分階段，一個都不能少
export const ITEM_ORDER: { key: string; stage: number }[] = [
  // ── 階段一：基礎健檢 ──
  { key: 'analytics', stage: 1 },     // 網站有無串接 GA、GSC
  { key: 'sitemap', stage: 1 },       // 正確提交或建立 Sitemap
  { key: 'robots', stage: 1 },        // 建立 robots.txt
  { key: 'orphan', stage: 1 },        // 有無孤島頁面
  { key: 'indexing', stage: 1 },      // 有無建立索引
  { key: 'localbiz', stage: 1 },      // Local Business 標籤設定
  { key: 'breadcrumb', stage: 1 },    // 有無麵包屑
  { key: 'internalLinks', stage: 1 }, // 內部連結結構
  { key: 'brokenLinks', stage: 1 },   // 無效連結檢查
  { key: 'duplicate', stage: 1 },     // 檢查重複內容
  // ── 階段二：結構與內容 ──
  { key: 'tkd', stage: 2 },           // TKD 完整性
  { key: 'headings', stage: 2 },      // h1、h2 使用
  { key: 'schema', stage: 2 },        // 結構化數據 (Schema)
  { key: 'llms', stage: 2 },          // 網站根目錄有無部署 llms.txt
  { key: 'page', stage: 2 },          // 有無網址 404
  { key: 'viewport', stage: 2 },      // 手機端優化
  { key: 'categoryDepth', stage: 2 }, // 分類層級是否清楚
  { key: 'homepage', stage: 2 },      // 首頁內容優化
  { key: 'imgAlt', stage: 2 },        // 圖片 ALT 標記
  { key: 'imgFormat', stage: 2 },     // 縮圖及多媒體優化
  { key: 'externalLinks', stage: 2 }, // 外部連結檢查
  { key: 'eeat', stage: 2 },          // 符合 E-E-A-T 原則
];

// key → 階段（給排序/分區用）
export const STAGE_OF: Record<string, number> = Object.fromEntries(
  ITEM_ORDER.map((x) => [x.key, x.stage]),
);

export type CheckResult = {
  key: string;        // 指標代碼（程式用）
  level: string;      // 影響層級
  category: string;   // 分類
  item: string;       // 確認事項（用表上原文）
  status: CheckStatus;// 狀態
  advice: string;     // SEO 建議事項（判斷結論）
  evidence?: string;  // 抓到的實際證據（例如：3/12 張圖 alt 空白）
  stage?: number;     // 屬於哪一階段（1 或 2）；最終輸出時依 STAGE_OF 補上
  details?: { url: string; note: string }[]; // 具體問題頁清單（完整網址＋該頁問題），給前端「查看更多」展開用
};

// 計算「中文字數」的近似值：以字元數計（中文全形一字算 1），
// 中文站的 title/description 幾乎全中文，用字元長度判斷長度門檻已足夠。
function charLen(s: string): number {
  return [...s.trim()].length;
}

// 從 root 抓所有 JSON-LD 區塊，解析出 @type 清單（含巢狀 @graph）
function extractJsonLd(root: NHTMLElement): { types: string[]; raw: string } {
  const types = new Set<string>();
  const rawParts: string[] = [];

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const text = script.rawText?.trim();
    if (!text) continue;
    rawParts.push(text);
    try {
      const data = JSON.parse(text);
      // 可能是單一物件、陣列，或帶 @graph 的容器，統一攤平後找 @type
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
      // JSON 解析失敗就只留原始內容，型別當作抓不到
    }
  }

  return { types: [...types], raw: rawParts.join('\n\n') };
}

// 規則層跑完的整包結果，另外附上給 AI 層用的原料
export type RuleReport = {
  checks: CheckResult[];
  jsonLdTypes: string[];   // 頁面所有 JSON-LD 的 @type 清單（給 AI 判斷 Schema 夠不夠）
  jsonLdRaw: string;       // JSON-LD 原始內容（截斷後給 AI）
  mainText: string;        // 頁面主要文字（截斷後給 AI 判斷 E-E-A-T）
  internalLinks: string[]; // 頁內指向同網域的連結（給 route 抽查無效連結用）
};

// 收集頁內連結，依網域分成「內部 / 外部」；內部去重、去 #錨點
function collectLinks(root: NHTMLElement, pageUrl: string): { internal: string[]; externalCount: number } {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return { internal: [], externalCount: 0 };
  }
  const internal = new Set<string>();
  let externalCount = 0;
  for (const a of root.querySelectorAll('a[href]')) {
    const raw = (a.getAttribute('href') ?? '').trim();
    // 跳過錨點、mailto、tel、javascript 這類非頁面連結
    if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.origin === origin) internal.add(abs.href.split('#')[0]);
    else externalCount++;
  }
  return { internal: [...internal], externalCount };
}

// 有無建立索引：檢查頁面是否被 noindex 阻擋（實際收錄仍建議以 GSC / site: 複核）
function checkIndexing(root: NHTMLElement): CheckResult {
  const base = { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有無建立索引' };
  const robots = (root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '').toLowerCase();
  const googlebot = (root.querySelector('meta[name="googlebot"]')?.getAttribute('content') ?? '').toLowerCase();
  const blocked = /noindex/.test(robots) || /noindex/.test(googlebot);
  return blocked
    ? { ...base, status: 'fail', advice: '頁面 meta robots 設有 noindex，會被排除在索引外，建議移除', evidence: robots || googlebot }
    : { ...base, status: 'ok', advice: '頁面未阻擋索引；實際收錄狀況建議以 GSC / site: 查詢人工複核', evidence: robots ? `robots：${robots}` : '（未設 noindex）' };
}

// Local Business 標籤設定：從 JSON-LD 型別判斷有無在地商家 Schema
function checkLocalBusiness(jsonLdTypes: string[]): CheckResult {
  const base = { key: 'localbiz', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: 'Local Business 標籤設定' };
  // LocalBusiness 及其常見子型別
  const LOCAL_TYPES = ['LocalBusiness', 'Store', 'Restaurant', 'Dentist', 'MedicalClinic', 'HealthAndBeautyBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness'];
  const hit = jsonLdTypes.filter((t) => LOCAL_TYPES.includes(t));
  return hit.length
    ? { ...base, status: 'warn', advice: `已部署 ${hit.join('、')} 標籤，欄位完整度（地址、電話、營業時間等）建議人工複核`, evidence: hit.join('、') }
    : { ...base, status: 'fail', advice: '未偵測到 LocalBusiness 標籤，建議於後台基本資料設定並部署，讓 Google 理解品牌', evidence: '（無）' };
}

// 內部連結結構：統計頁內指向同網域的連結數
function checkInternalLinks(internal: string[]): CheckResult {
  const base = { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '內部連結結構' };
  const n = internal.length;
  const evidence = `頁內內部連結 ${n} 條`;
  if (n === 0) return { ...base, status: 'fail', advice: '頁面沒有任何內部連結，會阻礙爬蟲探索與權重傳遞，建議補上導覽/相關連結', evidence };
  if (n < 5) return { ...base, status: 'warn', advice: `內部連結偏少（${n} 條），建議增加相關內容互連（全站結構建議人工複核）`, evidence };
  return { ...base, status: 'ok', advice: `內部連結數量合理（${n} 條）；整體結構建議人工複核`, evidence };
}

// 外部連結檢查：統計頁內指向外部網域的連結數（連結品質/有效性建議人工複核）
function checkExternalLinks(externalCount: number): CheckResult {
  const base = { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '外部連結檢查' };
  const evidence = `頁內外部連結 ${externalCount} 條`;
  return externalCount === 0
    ? { ...base, status: 'warn', advice: '頁面沒有外部連結，適度引用權威來源有助信任度，建議人工複核', evidence }
    : { ...base, status: 'ok', advice: `偵測到 ${externalCount} 條外部連結，連結有效性與品質建議人工複核`, evidence };
}

// 檢查重複內容：以有無 canonical 標籤粗判（重複內容風險仍建議全站人工複核）
function checkDuplicate(root: NHTMLElement): CheckResult {
  const base = { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '檢查重複內容' };
  const canonical = (root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '').trim();
  return canonical
    ? { ...base, status: 'ok', advice: '已設定 canonical，重複內容風險較低；全站重複情形建議人工複核', evidence: canonical }
    : { ...base, status: 'warn', advice: '未設定 canonical 標籤，容易產生重複內容，建議補上並人工複核', evidence: '（無 canonical）' };
}

// 分類層級是否清楚：以麵包屑 + 網址路徑深度粗判（分類架構建議人工複核）
function checkCategoryDepth(root: NHTMLElement, pageUrl: string, jsonLdTypes: string[]): CheckResult {
  const base = { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: '分類層級是否清楚' };
  const hasBreadcrumb = jsonLdTypes.includes('BreadcrumbList') || !!root.querySelector('[class*="breadcrumb" i]');
  let depth = 0;
  try {
    depth = new URL(pageUrl).pathname.split('/').filter(Boolean).length;
  } catch {
    /* 網址解析失敗 depth 維持 0 */
  }
  const evidence = `麵包屑：${hasBreadcrumb ? '有' : '無'}｜網址層級 ${depth}`;
  return hasBreadcrumb || depth >= 1
    ? { ...base, status: 'ok', advice: '網址/麵包屑呈現分類層級，尚屬清楚；整體分類架構建議人工複核', evidence }
    : { ...base, status: 'warn', advice: '未偵測到明顯分類層級（無麵包屑且網址扁平），建議規劃清楚分類並人工複核', evidence };
}

// TKD 完整性：title / meta description 有無 + 字數
function checkTkd(root: NHTMLElement): CheckResult {
  const base = { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: 'TKD 完整性' };
  const title = (root.querySelector('title')?.textContent ?? '').trim();
  const desc = (
    root.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  ).trim();

  const problems: string[] = [];
  if (!title) problems.push('Title 留空');
  else if (charLen(title) > 30) problems.push(`Title 過長（${charLen(title)} 字，建議 ≤30）`);
  if (!desc) problems.push('Description 留空');
  else if (charLen(desc) > 80) problems.push(`Description 過長（${charLen(desc)} 字，建議 ≤80）`);

  const evidence = `Title：${title || '（空）'}｜Description：${desc || '（空）'}`;
  return problems.length
    ? { ...base, status: 'fail', advice: problems.join('；'), evidence }
    : { ...base, status: 'ok', advice: 'Title 與 Description 皆有填且長度適當', evidence };
}

// h1、h2 使用：h1 應恰有 1 個、h2 至少 1 個
function checkHeadings(root: NHTMLElement): CheckResult {
  const base = { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: 'h1、h2 使用' };
  const h1s = root.querySelectorAll('h1');
  const h2s = root.querySelectorAll('h2');
  const evidence = `h1 × ${h1s.length}，h2 × ${h2s.length}`;

  const problems: string[] = [];
  if (h1s.length === 0) problems.push('缺少 <h1>');
  else if (h1s.length > 1) problems.push(`<h1> 有 ${h1s.length} 個（建議只留 1 個）`);
  if (h2s.length === 0) problems.push('缺少 <h2>');

  return problems.length
    ? { ...base, status: 'fail', advice: problems.join('；'), evidence }
    : { ...base, status: 'ok', advice: '標題結構完整', evidence };
}

// 圖片 ALT 標記：統計 alt 空白比例（跳過裝飾圖：role=presentation / aria-hidden）
function checkImgAlt(root: NHTMLElement): CheckResult {
  const base = { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片 ALT 標記' };
  const imgs = root.querySelectorAll('img').filter((img) => {
    const role = (img.getAttribute('role') ?? '').toLowerCase();
    const hidden = img.getAttribute('aria-hidden') === 'true';
    return role !== 'presentation' && !hidden;
  });

  if (imgs.length === 0) {
    return { ...base, status: 'ok', advice: '頁面沒有需檢查的圖片', evidence: '圖片 0 張' };
  }

  const empty = imgs.filter((img) => !(img.getAttribute('alt') ?? '').trim());
  // 列出前幾張空白圖的檔名（去重），讓建議具體指出是哪些圖
  const samples = [
    ...new Set(
      empty
        .map((img) => {
          const src = (img.getAttribute('src') || img.getAttribute('data-src') || '').split('?')[0];
          return src.split('/').pop() || src;
        })
        .filter(Boolean),
    ),
  ].slice(0, 5);
  const sampleText = samples.length ? `，例如：${samples.join('、')}${empty.length > samples.length ? ' 等' : ''}` : '';
  const evidence = `${empty.length}/${imgs.length} 張圖 alt 空白`;
  return empty.length
    ? { ...base, status: 'fail', advice: `有 ${empty.length}/${imgs.length} 張圖 alt 留空${sampleText}，Google 圖片搜尋無法抓取，建議補上描述性 alt`, evidence }
    : { ...base, status: 'ok', advice: '所有圖片皆有 alt', evidence };
}

// 手機端優化：是否有 viewport meta
function checkViewport(root: NHTMLElement): CheckResult {
  const base = { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機端優化' };
  const viewport = root.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  return viewport.trim()
    ? { ...base, status: 'ok', advice: '已設定 viewport', evidence: viewport }
    : { ...base, status: 'fail', advice: '缺少 <meta viewport>，手機端排版可能異常', evidence: '（無 viewport）' };
}

// 有無麵包屑：BreadcrumbList schema 或帶 breadcrumb 標記的 nav
function checkBreadcrumb(root: NHTMLElement, jsonLdTypes: string[]): CheckResult {
  const base = { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有無麵包屑' };
  const hasSchema = jsonLdTypes.includes('BreadcrumbList');
  const hasNav = !!root.querySelector(
    'nav[aria-label*="breadcrumb" i], nav[class*="breadcrumb" i], [class*="breadcrumb" i]',
  );
  return hasSchema || hasNav
    ? { ...base, status: 'ok', advice: '偵測到麵包屑', evidence: hasSchema ? 'BreadcrumbList schema' : 'breadcrumb 導覽元素' }
    : { ...base, status: 'warn', advice: '未偵測到麵包屑（BreadcrumbList 或 nav）', evidence: '（無）' };
}

// 網站有無串接 GA、GSC：在原始碼找 GA4 / UA / GTM / GSC 驗證碼
function checkAnalytics(html: string, root: NHTMLElement): CheckResult {
  const base = { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '網站有無串接GA、GSC等資料分析軟體' };
  const found: string[] = [];
  if (/G-[A-Z0-9]{6,}/.test(html)) found.push('GA4');
  if (/UA-\d{4,}-\d+/.test(html)) found.push('Universal Analytics');
  if (/GTM-[A-Z0-9]+/.test(html)) found.push('GTM');
  const gsc = root.querySelector('meta[name="google-site-verification"]');
  if (gsc) found.push('GSC 驗證碼');

  return found.length
    ? { ...base, status: 'ok', advice: `已偵測到：${found.join('、')}`, evidence: found.join('、') }
    : { ...base, status: 'fail', advice: '原始碼找不到 GA4 / GTM / GSC 追蹤碼', evidence: '（無）' };
}

// 縮圖及多媒體優化：統計非 WebP/AVIF 的圖片比例
function checkImageFormat(root: NHTMLElement): CheckResult {
  const base = { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '縮圖及多媒體優化' };
  const imgs = root.querySelectorAll('img');
  if (imgs.length === 0) {
    return { ...base, status: 'ok', advice: '頁面沒有圖片', evidence: '圖片 0 張' };
  }
  // 從 src 副檔名判斷格式（忽略查詢字串）
  const modern = imgs.filter((img) => {
    const src = (img.getAttribute('src') ?? '').split('?')[0].toLowerCase();
    return /\.(webp|avif)$/.test(src);
  });
  const legacy = imgs.length - modern.length;
  const evidence = `${legacy}/${imgs.length} 張為非 WebP/AVIF 格式`;
  return legacy > 0
    ? { ...base, status: 'warn', advice: '建議改用 WebP/AVIF 並壓縮至 200KB 以下', evidence }
    : { ...base, status: 'ok', advice: '圖片皆為現代格式', evidence };
}

// 抽取頁面主要文字（給 AI 判斷 E-E-A-T 用）：移除 script/style 後取 body 純文字
function extractMainText(root: NHTMLElement): string {
  const body = root.querySelector('body') ?? root;
  const clone = parse(body.outerHTML);
  clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

// 規則層總入口：吃單頁 HTML + 該頁網址，跑完所有可由單頁判斷的規則檢查
export function runHtmlRules(html: string, pageUrl: string): RuleReport {
  const root = parse(html);
  const { types: jsonLdTypes, raw: jsonLdRaw } = extractJsonLd(root);
  const { internal, externalCount } = collectLinks(root, pageUrl);

  const checks: CheckResult[] = [
    checkAnalytics(html, root),
    checkTkd(root),
    checkHeadings(root),
    checkViewport(root),
    checkBreadcrumb(root, jsonLdTypes),
    checkImgAlt(root),
    checkImageFormat(root),
    // ── 新增：對齊進度表補齊的項目（孤島頁面需 sitemap＋爬站，在 route 層處理）──
    checkIndexing(root),
    checkLocalBusiness(jsonLdTypes),
    checkInternalLinks(internal),
    checkExternalLinks(externalCount),
    checkDuplicate(root),
    checkCategoryDepth(root, pageUrl, jsonLdTypes),
  ];

  return {
    checks,
    jsonLdTypes,
    jsonLdRaw: jsonLdRaw.slice(0, 4000),
    mainText: extractMainText(root).slice(0, 3000),
    internalLinks: internal,
  };
}
