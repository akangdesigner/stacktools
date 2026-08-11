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

const ORG_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'legalName', label: '公司登記名稱' },
  { key: 'vatID', label: '統一編號' },
  { key: 'url', label: '網址' },
  { key: 'logo', label: 'Logo 圖片網址' },
  { key: 'image', label: '圖片網址' },
  { key: 'telephone', label: '電話' },
  { key: 'email', label: 'Email' },
  { key: 'description', label: '簡介', multiline: true },
  { key: 'sameAs', label: '社群/外部連結（每行一個網址）', multiline: true },
];

const PRODUCT_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'image', label: '圖片網址' },
  { key: 'brand', label: '品牌' },
  { key: 'sku', label: '商品編號 (SKU)' },
  { key: 'price', label: '售價' },
  { key: 'priceCurrency', label: '幣別', placeholder: 'TWD' },
  { key: 'availability', label: '庫存狀態', placeholder: 'https://schema.org/InStock' },
  { key: 'url', label: '商品網址' },
  { key: 'description', label: '簡介', multiline: true },
];

const OFFER_KEYS = ['price', 'priceCurrency', 'availability'];

const LOCAL_BIZ_FORM_FIELDS: FormFieldDef[] = [
  { key: 'name', label: '名稱' },
  { key: 'telephone', label: '電話' },
  { key: 'streetAddress', label: '街道地址' },
  { key: 'addressLocality', label: '縣市/區' },
  { key: 'postalCode', label: '郵遞區號' },
  { key: 'addressCountry', label: '國家代碼', placeholder: 'TW' },
  { key: 'openingHours', label: '營業時間', placeholder: 'Mo-Fr 09:00-18:00' },
  { key: 'priceRange', label: '價格區間', placeholder: '$$' },
  { key: 'url', label: '網址' },
  { key: 'image', label: '圖片網址' },
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
    out[f.key] = stringField(node[f.key]);
  }
  return out;
}

// 把表單值併回原始節點，其他既有欄位（如 hasOfferCatalog）原樣保留不動
export function mergeFormIntoNode(node: Record<string, unknown>, label: NodeEval['label'], values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...node };
  if (label === 'Organization') {
    for (const key of ['name', 'legalName', 'url', 'logo', 'image', 'telephone', 'email', 'description']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
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
    for (const key of ['name', 'telephone', 'openingHours', 'priceRange', 'url', 'image']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
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
    for (const key of ['name', 'image', 'sku', 'url', 'description']) {
      const v = values[key]?.trim();
      if (v) out[key] = v;
      else delete out[key];
    }
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
