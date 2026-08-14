import type { NodeEval } from './site-audit-schema';

// ── Schema 檢查工具：「補完 Schema」表單 ─────────────────────
// 跟 technicalseo.com 的產生器不同：不是從零開始填表單，而是把抓到的既有 JSON-LD
// 帶進表單當預設值，使用者只需要補缺的欄位，其他既有欄位（如 hasOfferCatalog）原樣保留。

export interface FormFieldDef {
  key: string; // 表單 state 的 key
  label: string;
  placeholder?: string;
  multiline?: boolean; // sameAs／description 用 textarea
}

// ── 營業時間：schema.org 的 openingHours 是 "Mo-Fr 09:00-18:00" 這種英文縮寫格式，
// 使用者不會自己打，改用「每天開關＋時間下拉」的表單，內部轉成正確格式的字串存進同一個 openingHours 欄位 ──

export const OPENING_HOURS_DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export type OpeningHoursDayKey = (typeof OPENING_HOURS_DAY_KEYS)[number];
export const OPENING_HOURS_DAY_LABELS: Record<OpeningHoursDayKey, string> = {
  Mo: '一', Tu: '二', We: '三', Th: '四', Fr: '五', Sa: '六', Su: '日',
};

export interface DayHours {
  open: boolean;
  opens: string;
  closes: string;
}
export type OpeningHoursByDay = Record<OpeningHoursDayKey, DayHours>;

// 下拉選單的時間選項：00:00 ~ 23:30，每 30 分鐘一格
export const OPENING_HOURS_TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function defaultDayHours(): DayHours {
  return { open: false, opens: '09:00', closes: '18:00' };
}

// 把既有的 openingHours 字串（可能是空的、或客戶網站抓回來的既有格式）拆成每天的開關/時段，讓表單能編輯
export function parseOpeningHoursString(raw: string | undefined): OpeningHoursByDay {
  const result = {} as OpeningHoursByDay;
  for (const d of OPENING_HOURS_DAY_KEYS) result[d] = defaultDayHours();
  if (!raw) return result;

  for (const group of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = group.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m) continue;
    const [, start, end, opens, closes] = m;
    const startIdx = OPENING_HOURS_DAY_KEYS.indexOf(start as OpeningHoursDayKey);
    const endIdx = end ? OPENING_HOURS_DAY_KEYS.indexOf(end as OpeningHoursDayKey) : startIdx;
    for (let i = startIdx; i <= endIdx; i++) result[OPENING_HOURS_DAY_KEYS[i]] = { open: true, opens, closes };
  }
  return result;
}

// 把每天的開關/時段組回 schema.org 認得的字串，連續好幾天時段一樣就合併成一個範圍（如 Mo-Fr 09:00-18:00）
export function buildOpeningHoursString(days: OpeningHoursByDay): string {
  const groups: string[] = [];
  let i = 0;
  while (i < OPENING_HOURS_DAY_KEYS.length) {
    const d = days[OPENING_HOURS_DAY_KEYS[i]];
    if (!d.open) { i++; continue; }
    let j = i;
    while (
      j + 1 < OPENING_HOURS_DAY_KEYS.length &&
      days[OPENING_HOURS_DAY_KEYS[j + 1]].open &&
      days[OPENING_HOURS_DAY_KEYS[j + 1]].opens === d.opens &&
      days[OPENING_HOURS_DAY_KEYS[j + 1]].closes === d.closes
    ) j++;
    const dayPart = j > i ? `${OPENING_HOURS_DAY_KEYS[i]}-${OPENING_HOURS_DAY_KEYS[j]}` : OPENING_HOURS_DAY_KEYS[i];
    groups.push(`${dayPart} ${d.opens}-${d.closes}`);
    i = j + 1;
  }
  return groups.join(',');
}

const ORG_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'legalName', label: '公司登記名稱' },
  { key: 'vatID', label: '統一編號' },
  { key: 'url', label: '網址' },
  { key: 'logo', label: 'Logo 圖片網址（每行一個）', multiline: true },
  { key: 'image', label: '圖片網址（每行一個）', multiline: true },
  { key: 'telephone', label: '電話' },
  { key: 'email', label: 'Email' },
  { key: 'description', label: '簡介', multiline: true },
  { key: 'sameAs', label: '社群/外部連結（每行一個網址）', multiline: true },
];

const PRODUCT_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'image', label: '圖片網址（每行一個，Google 建議提供多張不同比例）', multiline: true },
  { key: 'brand', label: '品牌' },
  { key: 'sku', label: '商品編號 (SKU)' },
  { key: 'price', label: '售價' },
  { key: 'priceCurrency', label: '幣別', placeholder: 'TWD' },
  { key: 'availability', label: '庫存狀態', placeholder: 'https://schema.org/InStock' },
  { key: 'url', label: '商品網址' },
  { key: 'description', label: '簡介', multiline: true },
];

const OFFER_KEYS = ['price', 'priceCurrency', 'availability'];

// LocalBusiness 在 schema.org 裡是 Organization 的子類型，本來就該含品牌識別欄位（統編/Logo/簡介/
// 社群連結），不是只有地址/營業時間——不然填「在地商家」會漏掉這些，讓人誤以為還要另外填「組織/品牌」貼第二份
const LOCAL_BIZ_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'legalName', label: '公司登記名稱' },
  { key: 'vatID', label: '統一編號' },
  { key: 'telephone', label: '電話' },
  { key: 'email', label: 'Email' },
  { key: 'streetAddress', label: '街道地址' },
  { key: 'addressLocality', label: '縣市/區' },
  { key: 'postalCode', label: '郵遞區號' },
  { key: 'addressCountry', label: '國家代碼', placeholder: 'TW' },
  { key: 'openingHours', label: '營業時間', placeholder: 'Mo-Fr 09:00-18:00' },
  { key: 'priceRange', label: '價格區間', placeholder: '$$' },
  { key: 'url', label: '網址' },
  { key: 'image', label: '圖片網址（每行一個）', multiline: true },
  { key: 'description', label: '簡介', multiline: true },
  { key: 'sameAs', label: '社群/外部連結（每行一個網址）', multiline: true },
];

const ADDRESS_KEYS = ['streetAddress', 'addressLocality', 'postalCode', 'addressCountry'];

// logo/image 常見寫成巢狀 ImageObject（{"@type":"ImageObject","url":"..."}），不是純字串網址，
// 常見於 WordPress Yoast SEO 產出的 schema；純字串就直接用，物件就取裡面的 url/contentUrl
function stringField(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.url === 'string') return o.url;
    if (typeof o.contentUrl === 'string') return o.contentUrl;
  }
  return '';
}

// image/logo 也常見寫成陣列（多張圖／不同比例），攤平成每行一個網址方便編輯
function imageUrlList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(imageUrlList);
  const s = stringField(v);
  return s ? [s] : [];
}

// Google 要求 image/logo 一定要是絕對網址，相對路徑（如 /img/logo.png）爬蟲抓不到，會直接被判定沒有圖
function isAbsoluteUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

// 把 textarea 每行輸入拆成陣列；輸出時單一網址存字串、多筆存陣列，跟 schema.org 慣例一致
function parseImageLines(raw: string | undefined): string[] {
  return (raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function setImageField(out: Record<string, unknown>, key: string, raw: string | undefined) {
  const list = parseImageLines(raw);
  if (list.length === 0) delete out[key];
  else if (list.length === 1) out[key] = list[0];
  else out[key] = list;
}

// 表單裡填的網址不是 http(s):// 開頭時提醒使用者，避免產出 Google 爬不到的相對路徑
export function validateImageUrls(values: Record<string, string>): string[] {
  const warnings: string[] = [];
  for (const [key, label] of [['logo', 'Logo'], ['image', '圖片']] as const) {
    const bad = parseImageLines(values[key]).filter((u) => !isAbsoluteUrl(u));
    if (bad.length) warnings.push(`${label} 網址不是完整網址（缺 http:// 或 https://）：${bad.join('、')}`);
  }
  return warnings;
}

// brand 常見寫成純字串，也常見包成 {"@type":"Brand","name":"..."}
function stringOrName(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.name === 'string') return o.name;
  }
  return '';
}

// offers 可能是單一物件，也可能是陣列（多種規格/通路），表單只對照第一筆
function firstOffer(v: unknown): Record<string, unknown> {
  if (Array.isArray(v)) return (v.find((x) => x && typeof x === 'object') as Record<string, unknown>) ?? {};
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return {};
}

export function formFieldsFor(label: NodeEval['label']): FormFieldDef[] | null {
  if (label === 'Organization') return ORG_FORM_FIELDS;
  if (label === 'LocalBusiness') return LOCAL_BIZ_FORM_FIELDS;
  if (label === 'Product') return PRODUCT_FORM_FIELDS;
  return null;
}

// 生成工具從零開始時的空白節點（沒有匯入既有資料）
export function emptyNode(label: 'LocalBusiness' | 'Organization' | 'Product'): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': label };
}

// 把既有節點的值帶進表單預設值，缺的欄位留空讓使用者填
export function buildFormDefaults(node: Record<string, unknown>, label: NodeEval['label']): Record<string, string> {
  const fields = formFieldsFor(label);
  if (!fields) return {};
  const address = node.address && typeof node.address === 'object' ? (node.address as Record<string, unknown>) : {};
  const offer = label === 'Product' ? firstOffer(node.offers) : {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (label === 'LocalBusiness' && ADDRESS_KEYS.includes(f.key)) {
      const v = address[f.key];
      out[f.key] = typeof v === 'string' ? v : '';
      continue;
    }
    if (f.key === 'sameAs') {
      const v = node.sameAs;
      out[f.key] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join('\n') : '';
      continue;
    }
    if (label === 'Product' && OFFER_KEYS.includes(f.key)) {
      const v = offer[f.key];
      out[f.key] = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
      continue;
    }
    if (label === 'Product' && f.key === 'brand') {
      out[f.key] = stringOrName(node.brand);
      continue;
    }
    if (f.key === 'logo' || f.key === 'image') {
      out[f.key] = imageUrlList(node[f.key]).join('\n');
      continue;
    }
    out[f.key] = stringField(node[f.key]);
  }
  return out;
}

// 把表單值併回原始節點，其他既有欄位（如 hasOfferCatalog）原樣保留不動
export function mergeFormIntoNode(node: Record<string, unknown>, label: NodeEval['label'], values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...node };
  if (label === 'Organization') {
    for (const key of ['name', 'legalName', 'url', 'telephone', 'email', 'description']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
    setImageField(out, 'logo', values.logo);
    setImageField(out, 'image', values.image);
    const vatID = values.vatID?.trim();
    if (vatID) {
      out.vatID = vatID;
      out.taxID = vatID;
    } else {
      delete out.vatID;
      delete out.taxID;
    }
    const sameAsLines = (values.sameAs ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (sameAsLines.length) out.sameAs = sameAsLines;
    else delete out.sameAs;
  } else if (label === 'LocalBusiness') {
    for (const key of ['name', 'legalName', 'telephone', 'email', 'description', 'openingHours', 'priceRange', 'url']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
    setImageField(out, 'image', values.image);
    const vatID = values.vatID?.trim();
    if (vatID) {
      out.vatID = vatID;
      out.taxID = vatID;
    } else {
      delete out.vatID;
      delete out.taxID;
    }
    const sameAsLines = (values.sameAs ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (sameAsLines.length) out.sameAs = sameAsLines;
    else delete out.sameAs;
    const street = values.streetAddress?.trim();
    const locality = values.addressLocality?.trim();
    const postal = values.postalCode?.trim();
    const country = values.addressCountry?.trim();
    if (street || locality || postal || country) {
      out.address = {
        '@type': 'PostalAddress',
        ...(street && { streetAddress: street }),
        ...(locality && { addressLocality: locality }),
        ...(postal && { postalCode: postal }),
        ...(country && { addressCountry: country }),
      };
    } else {
      delete out.address;
    }
  } else if (label === 'Product') {
    for (const key of ['name', 'sku', 'url', 'description']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
    setImageField(out, 'image', values.image);
    const brand = values.brand?.trim();
    if (brand) out.brand = { '@type': 'Brand', name: brand };
    else delete out.brand;

    const price = values.price?.trim();
    const priceCurrency = values.priceCurrency?.trim();
    const availability = values.availability?.trim();
    if (price || priceCurrency || availability) {
      const baseOffer = firstOffer(node.offers);
      out.offers = {
        ...baseOffer,
        '@type': typeof baseOffer['@type'] === 'string' ? baseOffer['@type'] : 'Offer',
        ...(price && { price }),
        ...(priceCurrency && { priceCurrency }),
        ...(availability && { availability }),
      };
    } else {
      delete out.offers;
    }
  }
  return out;
}
