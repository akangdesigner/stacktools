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

export type CheckResult = {
  key: string;        // 指標代碼（程式用）
  level: string;      // 影響層級
  category: string;   // 分類
  item: string;       // 確認事項（用表上原文）
  status: CheckStatus;// 狀態
  advice: string;     // SEO 建議事項（判斷結論）
  evidence?: string;  // 抓到的實際證據（例如：3/12 張圖 alt 空白）
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
};

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
  const evidence = `${empty.length}/${imgs.length} 張圖 alt 空白`;
  return empty.length
    ? { ...base, status: 'fail', advice: '有圖片 alt 留空，Google 圖片搜尋無法抓取', evidence }
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

// 規則層總入口：吃單頁 HTML，跑完所有規則檢查
export function runHtmlRules(html: string): RuleReport {
  const root = parse(html);
  const { types: jsonLdTypes, raw: jsonLdRaw } = extractJsonLd(root);

  const checks: CheckResult[] = [
    checkAnalytics(html, root),
    checkTkd(root),
    checkHeadings(root),
    checkViewport(root),
    checkBreadcrumb(root, jsonLdTypes),
    checkImgAlt(root),
    checkImageFormat(root),
  ];

  return {
    checks,
    jsonLdTypes,
    jsonLdRaw: jsonLdRaw.slice(0, 4000),
    mainText: extractMainText(root).slice(0, 3000),
  };
}
