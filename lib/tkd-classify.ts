// 用 AI 判斷候選頁面的型態與是否建議收錄進登記表。
// 各平台網址格式差異太大（Shopline /categories/、91APP /SalePage/Index/123、CYBERBIZ /collections/...），
// 正則判不準，改讓模型看「網址＋選單頁名」整批判斷；AI 掛掉時退回正則規則，不讓流程中斷。
import { prettyUrl, type PageRef } from './tkd-crawler';

const MODEL = 'anthropic/claude-haiku-4.5';

// 頁面型態（也是畫面上分組顯示的順序）
export const PAGE_TYPES = ['首頁', '形象頁', '分類頁', '產品頁', '部落格', '促銷', '功能頁', '其他'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export type ClassifiedPage = PageRef & {
  type: PageType;
  include: boolean; // AI 建議是否納入登記表（使用者可在畫面上改勾）
};

// 一次丟給 AI 的頁數上限：太多回覆會被截短，超過就分批「依序」呼叫（不可並行）
const CHUNK_SIZE = 120;

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools TKD',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // 分類要穩定，不需要創意
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(pages: PageRef[]): string {
  const lines = pages
    .map((p, i) => `${i}\t${p.label || '(無頁名)'}\t${prettyUrl(p.url)}`)
    .join('\n');
  return `你是 SEO 稽核助手。以下是從某客戶網站蒐集到的頁面清單（編號、選單頁名、網址），請判斷每一頁的「型態」與「是否建議納入 TKD 登記表」。

【型態定義】只能用以下八種：
- 首頁：網站首頁
- 形象頁：關於我們、聯絡我們、常見問題、服務介紹、品牌故事、門市資訊等固定說明頁
- 分類頁：商品分類／集合頁（如 /categories/、/collections/、SalePageCategory）
- 產品頁：單一產品／服務／建案／作品的內頁（如 /products/xxx、/SalePage/Index/123；非電商網站的建案、作品集、服務項目內頁也算）
- 部落格：部落格總覽頁或單篇文章（含最新消息、活動紀錄的總覽頁）
- 促銷：限時活動、檔期促銷、優惠活動、單場活動紀錄
- 功能頁：登入、註冊、購物車、會員中心、訂單查詢、優惠券、搜尋、報名／預約表單等操作功能頁
- 其他：無法歸類的

【是否收錄（include）規則】
- 首頁、形象頁、分類頁、產品頁：true（產品頁不論數量多寡一律收）
- 部落格「總覽／列表頁」：true；部落格「單篇文章」：false
- 促銷：false（短期活動對 TKD 稽核意義低）
- 功能頁：false
- 大量同質的清單型單頁（特約商店、合作店家、夥伴介紹等，通常在同一目錄下如 /stores/xxx）：
  只收「入口／總覽頁」，單頁一律 false——這些不是網站主要營運頁面，塞進登記表是噪音
- 其他：true（寧可列出讓使用者自己取消勾選）

【一致性】同一目錄下的頁面（如 /stores/、/events/、/portfolio/ 底下）性質相同，type 與 include 必須給一致的判斷。

【頁面清單】
編號\t頁名\t網址
${lines}

【輸出格式】
只回傳 JSON 陣列，每頁一筆，不要任何多餘說明或 markdown：
[{"i":0,"type":"首頁","include":true},{"i":1,"type":"功能頁","include":false}]
每個編號都要出現，type 只能用上面八種字串。`;
}

// 從 AI 回覆解析 JSON 陣列（容忍 \`\`\`json 包裹或前後雜訊）
function parseClassification(text: string): { i: number; type: string; include: boolean }[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
      .map((o) => ({
        i: Number(o.i),
        type: String(o.type ?? ''),
        include: o.include === true,
      }))
      .filter((o) => Number.isInteger(o.i));
  } catch {
    return null;
  }
}

function isPageType(s: string): s is PageType {
  return (PAGE_TYPES as readonly string[]).includes(s);
}

// 正則退路：AI 不可用時的粗略分類，規則跟 prompt 一致（判不準的一律「其他＋收錄」讓使用者自己勾）
export function classifyByRules(pages: PageRef[], site?: string): ClassifiedPage[] {
  const homeKey = (site ?? '').replace(/\/+$/, '').toLowerCase();
  return pages.map((p) => {
    const u = prettyUrl(p.url).toLowerCase();
    const path = u.replace(/^https?:\/\/[^/]+/, '');
    let type: PageType = '其他';
    if (u.replace(/\/+$/, '') === homeKey || path === '' || path === '/') type = '首頁';
    else if (/(login|sign[-_]?in|sign[-_]?up|cart|checkout|member|account|coupon|wishlist|favorite|trace|\/search)/.test(u)) type = '功能頁';
    else if (/(\/about|\/contact|\/faq|\/qa\b|\/pages?\/|introduce)/.test(path)) type = '形象頁';
    else if (/(\/categories\/|\/collections\/|salepagecategory|\/category\/)/.test(path)) type = '分類頁';
    else if (/(\/products?\/|\/salepage\/)/.test(path)) type = '產品頁';
    else if (/(\/blogs?(\/|$)|\/news(\/|$)|\/posts?(\/|$)|\/articles?(\/|$))/.test(path)) type = '部落格';
    else if (/(promotion|\/event|\/activity|\/campaign|限時|優惠|活動)/.test(path)) type = '促銷';

    // 部落格只收總覽：路徑在 blog 入口本身（沒有更深層級）才算總覽
    const isBlogIndex = type === '部落格' && /(\/blogs?|\/news|\/posts)\/?$/.test(path);
    const include =
      type === '首頁' || type === '形象頁' || type === '分類頁' || type === '產品頁' || type === '其他' || isBlogIndex;
    return { ...p, type, include };
  });
}

// 同一目錄的頁面分批分類時可能拿到不同判斷（各批看不到彼此），分類後做一致化：
// 同一父路徑下 ≥3 頁且判斷不一致時，以多數決統一。根目錄直下不歸戶
// （中文 slug 網站全站都掛在根目錄，硬歸戶會把首頁/形象頁全部壓平）
function harmonizeByDirectory(pages: ClassifiedPage[]): ClassifiedPage[] {
  const parentOf = (u: string): string | null => {
    try {
      const url = new URL(u);
      const segs = url.pathname.split('/').filter(Boolean);
      if (segs.length < 2) return null;
      return `${url.host}/${segs.slice(0, -1).join('/').toLowerCase()}`;
    } catch {
      return null;
    }
  };
  const groups = new Map<string, number[]>();
  pages.forEach((p, i) => {
    const key = parentOf(p.url);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const result = [...pages];
  for (const idxs of groups.values()) {
    if (idxs.length < 3) continue;
    // 統計「型態+是否收錄」的組合票數
    const votes = new Map<string, number>();
    for (const i of idxs) {
      const k = `${result[i].type}|${result[i].include}`;
      votes.set(k, (votes.get(k) ?? 0) + 1);
    }
    let bestKey = '';
    let bestCount = 0;
    for (const [k, n] of votes) {
      if (n > bestCount) {
        bestCount = n;
        bestKey = k;
      }
    }
    if (bestCount === idxs.length) continue; // 已一致，不用動
    const [type, inc] = bestKey.split('|');
    if (!isPageType(type)) continue;
    for (const i of idxs) result[i] = { ...result[i], type, include: inc === 'true' };
  }
  return result;
}

// 主入口：AI 分批分類（依序呼叫），失敗的批次退回正則規則
export async function classifyPages(pagesInput: PageRef[], site?: string): Promise<ClassifiedPage[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || pagesInput.length === 0) return classifyByRules(pagesInput, site);

  // 按網址排序再分批，讓同目錄的頁面盡量落在同一批（AI 一次看到整組才判得一致）；
  // 分類完按原順序還原，不影響畫面上「選單頁在前」的排列
  const order = pagesInput.map((_, i) => i).sort((a, b) => pagesInput[a].url.localeCompare(pagesInput[b].url));
  const pages = order.map((i) => pagesInput[i]);

  const result: ClassifiedPage[] = [];
  for (let start = 0; start < pages.length; start += CHUNK_SIZE) {
    const chunk = pages.slice(start, start + CHUNK_SIZE);
    let classified: ClassifiedPage[] | null = null;
    try {
      const text = await askOpenRouter(buildPrompt(chunk), apiKey);
      const parsed = parseClassification(text);
      if (parsed) {
        const byIndex = new Map(parsed.map((o) => [o.i, o]));
        classified = chunk.map((p, i) => {
          const o = byIndex.get(i);
          if (!o || !isPageType(o.type)) return classifyByRules([p], site)[0]; // 漏判的單頁退回規則
          return { ...p, type: o.type, include: o.include };
        });
      }
    } catch {
      // AI 掛掉不讓流程中斷，整批退回規則分類
    }
    result.push(...(classified ?? classifyByRules(chunk, site)));
  }

  // 還原成呼叫端傳入的原順序，再做同目錄一致化與收錄規則強制
  const restored: ClassifiedPage[] = new Array(result.length);
  order.forEach((originalIndex, sortedIndex) => {
    restored[originalIndex] = result[sortedIndex];
  });
  return enforceIncludeRules(harmonizeByDirectory(restored));
}

// 收錄規則在程式層強制執行，不依賴 AI 聽話：首頁/形象頁/分類頁/產品頁一律收、
// 促銷/功能頁一律不收；部落格（總覽收、單篇不收）與其他（清單型單頁不收）由 AI 判斷
function enforceIncludeRules(pages: ClassifiedPage[]): ClassifiedPage[] {
  return pages.map((p) => {
    if (p.type === '首頁' || p.type === '形象頁' || p.type === '分類頁' || p.type === '產品頁') {
      return { ...p, include: true };
    }
    if (p.type === '促銷' || p.type === '功能頁') {
      return { ...p, include: false };
    }
    return p;
  });
}
