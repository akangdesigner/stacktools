import { LEVEL, CATEGORY, type CheckResult } from './site-audit-rules';

// ── 網站技術健檢：Schema 完整度規則層 ─────────────────────
// 純規則核對 JSON-LD 欄位完整度，取代原本丟一段文字叫 AI 猜「夠不夠」的做法。
// 依 Google 結構化資料指南列出的關鍵欄位，缺什麼就列什麼，不再是「建議人工複核」的空話。

export const LOCAL_TYPES = ['LocalBusiness', 'Store', 'Restaurant', 'Dentist', 'MedicalClinic', 'HealthAndBeautyBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'JewelryStore'];
const ARTICLE_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];
const PRODUCT_TYPES = ['Product'];
// 純線上品牌/電商常見標法（如 91APP 站台），沒有實體門市所以不套 LocalBusiness 的地址/營業時間規則
const ORG_TYPES = ['Organization', 'Corporation'];

type JsonLdNode = Record<string, unknown>;

function nodeTypes(node: JsonLdNode): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

// LocalBusiness 家族關鍵欄位：地址、電話、營業時間
function missingLocalBizFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.address)) missing.push('地址');
  if (!truthy(node.telephone)) missing.push('電話');
  if (!truthy(node.openingHours) && !truthy(node.openingHoursSpecification)) missing.push('營業時間');
  return missing;
}

// Product 關鍵欄位：售價/庫存、圖片
function missingProductFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.offers)) missing.push('售價/庫存 (offers)');
  if (!truthy(node.image)) missing.push('圖片');
  return missing;
}

// Article 關鍵欄位：作者、發布日期
function missingArticleFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.author)) missing.push('作者');
  if (!truthy(node.datePublished)) missing.push('發布日期');
  return missing;
}

// Organization 關鍵欄位：品牌識別（Logo）、聯絡方式、社群連結——不檢查地址/營業時間（純線上品牌常沒有）
function missingOrganizationFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.logo) && !truthy(node.image)) missing.push('品牌 Logo');
  if (!truthy(node.telephone) && !truthy(node.email)) missing.push('聯絡方式（電話或 Email）');
  if (!truthy(node.sameAs)) missing.push('社群連結 (sameAs)');
  return missing;
}

// 常見商家識別欄位 → 中文標籤（依序檢查，vatID／taxID 兩個 key 都對到「統一編號」只顯示一次）
const FIELD_LABELS: [key: string, label: string][] = [
  ['name', '名稱'],
  ['legalName', '公司登記名稱'],
  ['vatID', '統一編號'],
  ['taxID', '統一編號'],
  ['telephone', '電話'],
  ['email', 'Email'],
  ['priceRange', '價格區間'],
  ['url', '網址'],
];

// PostalAddress 可能是純字串，也可能是物件（streetAddress/addressLocality/…），統一組成一行地址
function formatAddress(v: unknown): string | null {
  if (!truthy(v)) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const a = v as JsonLdNode;
    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
    return parts.length ? parts.join(' ') : null;
  }
  return null;
}

// openingHours 可能是字串/字串陣列，openingHoursSpecification 是結構化的 dayOfWeek+opens+closes
function formatOpeningHours(hours: unknown, spec: unknown): string | null {
  if (typeof hours === 'string' && hours.trim()) return hours;
  if (Array.isArray(hours) && hours.length) {
    const text = hours.filter((x): x is string => typeof x === 'string').join('；');
    if (text) return text;
  }
  if (Array.isArray(spec) && spec.length) {
    const text = spec
      .map((s) => {
        if (!s || typeof s !== 'object') return '';
        const o = s as JsonLdNode;
        const days = Array.isArray(o.dayOfWeek) ? o.dayOfWeek.join('、') : typeof o.dayOfWeek === 'string' ? o.dayOfWeek : '';
        const opens = typeof o.opens === 'string' ? o.opens : '';
        const closes = typeof o.closes === 'string' ? o.closes : '';
        return [days, opens && closes ? `${opens}-${closes}` : ''].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join('；');
    if (text) return text;
  }
  return null;
}

export interface DisplayField {
  label: string;
  value: string;
}

// 把節點裡常見的商家識別欄位整理成好讀的 label/value 清單，前端直接列出來，不用自己讀 JSON
export function extractDisplayFields(node: JsonLdNode): DisplayField[] {
  const out: DisplayField[] = [];
  const seen = new Set<string>();
  for (const [key, label] of FIELD_LABELS) {
    if (seen.has(label)) continue;
    const v = node[key];
    if (typeof v === 'string' && v.trim()) {
      out.push({ label, value: v });
      seen.add(label);
    }
  }
  const address = formatAddress(node.address);
  if (address) out.push({ label: '地址', value: address });
  const hours = formatOpeningHours(node.openingHours, node.openingHoursSpecification);
  if (hours) out.push({ label: '營業時間', value: hours });
  if (Array.isArray(node.sameAs)) {
    const links = node.sameAs.filter((x): x is string => typeof x === 'string');
    if (links.length) out.push({ label: '社群/外部連結', value: links.join('、') });
  }
  return out;
}

// 單一節點的型別分類、關鍵欄位判斷（label 為空字串代表不是我們追蹤完整度的關鍵型別）與好讀欄位清單
export interface NodeEval {
  types: string[];
  label: '' | 'LocalBusiness' | 'Organization' | 'Product' | 'Article';
  missing: string[];
  fields: DisplayField[];
}

export function evalNode(node: JsonLdNode): NodeEval {
  const types = nodeTypes(node);
  const fields = extractDisplayFields(node);
  if (types.some((t) => LOCAL_TYPES.includes(t))) return { types, label: 'LocalBusiness', missing: missingLocalBizFields(node), fields };
  if (types.some((t) => ORG_TYPES.includes(t))) return { types, label: 'Organization', missing: missingOrganizationFields(node), fields };
  if (types.some((t) => PRODUCT_TYPES.includes(t))) return { types, label: 'Product', missing: missingProductFields(node), fields };
  if (types.some((t) => ARTICLE_TYPES.includes(t))) return { types, label: 'Article', missing: missingArticleFields(node), fields };
  return { types, label: '', missing: [], fields };
}

export interface SchemaPage {
  url: string;
  jsonLdNodes: JsonLdNode[];
}

// 「Local Business 標籤設定」：逐頁檢查 LocalBusiness 家族節點的關鍵欄位完整度
export function buildLocalBizCheck(pages: SchemaPage[]): CheckResult {
  const base = { key: 'localbiz', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: 'Local Business 標籤設定' };
  const foundTypes = new Set<string>();
  const details: { url: string; note: string }[] = [];
  let deployedPages = 0;
  let completePages = 0;

  for (const p of pages) {
    const localNodes = p.jsonLdNodes.filter((n) => nodeTypes(n).some((t) => LOCAL_TYPES.includes(t)));
    if (localNodes.length === 0) continue;
    deployedPages++;
    for (const n of localNodes) nodeTypes(n).forEach((t) => LOCAL_TYPES.includes(t) && foundTypes.add(t));
    // 一頁可能有多個 LocalBusiness 節點，取欄位缺最少的那個當這頁的代表結果
    const bestMissing = localNodes.map(missingLocalBizFields).sort((a, b) => a.length - b.length)[0];
    if (bestMissing.length === 0) {
      completePages++;
    } else {
      details.push({ url: p.url, note: `LocalBusiness 缺：${bestMissing.join('、')}` });
    }
  }

  if (deployedPages === 0) {
    return { ...base, status: 'fail', advice: '全站未偵測到 LocalBusiness 標籤，建議於後台基本資料設定並部署，讓 Google 理解品牌', evidence: '（無）' };
  }
  const typesText = [...foundTypes].join('、');
  if (completePages === deployedPages) {
    return { ...base, status: 'ok', advice: `全站已部署 ${typesText} 標籤，地址、電話、營業時間欄位皆完整（${completePages}/${deployedPages} 頁）`, evidence: `${completePages}/${deployedPages} 頁欄位完整` };
  }
  return {
    ...base,
    status: 'warn',
    advice: `全站已部署 ${typesText} 標籤，但 ${deployedPages - completePages}/${deployedPages} 頁欄位不完整，例如：${details.slice(0, 3).map((d) => d.note).join('；')}，建議補齊`,
    evidence: `${completePages}/${deployedPages} 頁欄位完整`,
    details,
  };
}

// 「結構化數據 (Schema)」：GSC 沒資料時的 fallback，純規則判斷全站 JSON-LD 完整度（不再叫 AI 猜）
export function buildSchemaCompletenessCheck(pages: SchemaPage[]): CheckResult {
  const base = { key: 'schema', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '結構化數據 (Schema)' };
  const allTypes = new Set<string>();
  const details: { url: string; note: string }[] = [];
  let importantNodeCount = 0;
  let incompleteCount = 0;

  for (const p of pages) {
    for (const node of p.jsonLdNodes) {
      const types = nodeTypes(node);
      types.forEach((t) => allTypes.add(t));
      let missing: string[] = [];
      let label = '';
      if (types.some((t) => LOCAL_TYPES.includes(t))) { missing = missingLocalBizFields(node); label = 'LocalBusiness'; }
      else if (types.some((t) => PRODUCT_TYPES.includes(t))) { missing = missingProductFields(node); label = 'Product'; }
      else if (types.some((t) => ARTICLE_TYPES.includes(t))) { missing = missingArticleFields(node); label = 'Article'; }
      else continue;
      importantNodeCount++;
      if (missing.length) {
        incompleteCount++;
        details.push({ url: p.url, note: `${label} 缺：${missing.join('、')}` });
      }
    }
  }

  if (allTypes.size === 0) {
    return { ...base, status: 'fail', advice: '全站原始碼找不到任何 JSON-LD 結構化資料，建議依頁面性質部署 LocalBusiness / Product / Article / BreadcrumbList 等 Schema', evidence: '（無）' };
  }
  const typesText = [...allTypes].join('、');
  if (importantNodeCount === 0) {
    return { ...base, status: 'warn', advice: `全站偵測到 ${typesText}，但未偵測到 LocalBusiness / Product / Article 等關鍵型別，建議依頁面性質補上對應 Schema`, evidence: typesText };
  }
  if (incompleteCount === 0) {
    return { ...base, status: 'ok', advice: `全站偵測到 ${typesText}，關鍵型別（LocalBusiness / Product / Article）欄位皆完整`, evidence: typesText };
  }
  return {
    ...base,
    status: 'warn',
    advice: `全站偵測到 ${typesText}，其中 ${incompleteCount}/${importantNodeCount} 個關鍵節點欄位不完整，例如：${details.slice(0, 3).map((d) => d.note).join('；')}，建議補齊`,
    evidence: typesText,
    details,
  };
}
