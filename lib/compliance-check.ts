import { parse, HTMLElement as NHTMLElement } from 'node-html-parser';
import { fetchWithTimeout } from './site-audit-crawler';

// ── 文案法規檢查 ────────────────────────────────────
// 一篇文章拆成句子，跑三層檢查：
//   1. 禁詞（程式比對，100% 準、不花錢）：各客戶自己的禁用詞＋建議替換詞
//   2. 必備項目（程式比對）：例如醫美文章一定要放療程但書
//   3. 換句話說的風險（Jev 決策模型）：沒用到禁詞、但意思是在宣稱療效／招攬的句子
// Jev 是 TypeSafe 的 System One 模型，只回「是／否」機率、不生文字，走 OpenRouter 的 decisions API。

// ── 規則資料 ─────────────────────────────────────────

export interface BannedWord {
  word: string;
  replace?: string; // 建議替換詞（客戶規範有給才填）
  note?: string; // 為什麼不能用（例如「涉及身體結構」）
  except?: string[]; // 正常用法例外：命中處落在這些詞裡面就不算（例如「塑身」遇到「塑身衣」）
  group?: string; // 出自哪個產品的規範（只做顯示，禁詞一律全部套用）
}

// 必備項目：文章裡至少要出現 anyOf 其中一個字串，否則報缺
export interface RequiredItem {
  label: string;
  anyOf: string[];
  hint: string; // 缺的時候給的說明
}

export interface ClientRuleSet {
  id: string;
  name: string;
  source: string; // 規則出處（Drive 文件名），方便日後回頭對
  banned: BannedWord[];
  required: RequiredItem[];
}

const words = (list: string[], note?: string, group?: string): BannedWord[] =>
  list.map((word) => ({ word, note, group, except: COMMON_EXCEPTIONS[word] }));

// 禁詞的常見正常用法（字面比對會誤抓）
const COMMON_EXCEPTIONS: Record<string, string[]> = {
  塑身: ['塑身衣', '塑身褲'],
  肥: ['肥皂', '肥料', '施肥'],
  胖: ['胖胖'],
  瘦: ['瘦肉'],
  推薦: ['推薦閱讀'],
};

// 官方準則裡「不論有沒有認證都不能用」的詞，所有客戶的法規檢查都套用
// 出處：化粧品標示宣傳廣告涉及虛偽誇大或醫療效能認定準則附件一、四；藥事法第 69 條（非藥物不得宣稱醫療效能）
export const OFFICIAL_BANNED: BannedWord[] = [
  '殺菌', '換膚', '醫美級', '水光針', '婦女病', '預防感染', '降低感染', '減少感染', '防脫髮', '預防落髮', '生髮', '消痘', '除疤',
].map((word) => ({ word, note: '官方準則：不論有沒有認證都不能用', group: '官方準則' }));

// Jev 判斷的產品類別
export type ProductCategory = 'cosmetic' | 'food' | 'textile' | 'laundry' | 'none';
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  cosmetic: '化粧品',
  food: '食品',
  textile: '紡織品',
  laundry: '衣物清潔劑',
  none: '',
};

// 各類別「官方明列可用」的詞句：句子被 Jev 判高風險時，若含這些詞就標註「此類別可用」讓人判斷
// 出處：化粧品認定準則附件二（需有數據佐證）、食品認定準則附件一／二；紡織品不歸化粧品法管
const ALLOWED_BY_CATEGORY: Record<ProductCategory, string[]> = {
  cosmetic: ['美白', '淨白', '改善暗沉', '保濕', '控油', '抗痘', '抗屑', '強健髮根', '弱酸'],
  food: ['使排便順暢', '幫助維持消化道機能', '改變細菌叢生態', '調整體質', '養顏美容', '促進膠原蛋白形成', '營養補給'],
  textile: ['3A', 'AAA', '抗菌', '排濕', '透氣'],
  laundry: ['去漬', '去污', '洗淨'],
  none: [],
};

// 規則來自 Drive「客戶」資料夾裡各客戶的規範文件（2026-09-24 整理）
export const CLIENT_RULES: ClientRuleSet[] = [
  {
    id: 'general',
    name: '通用（只套官方準則）',
    source: '無客戶專屬規範，只套官方準則禁詞',
    banned: [],
    required: [],
  },
  {
    id: 'relove',
    name: 'Relove',
    source: 'Relove／文章素材／廣告文案字眼規範.docx',
    banned: [
      // 纖纖飲
      ...words(
        ['肥胖紋', '橘皮', '瘦身', 'SO身', '減肥', '減重', '宿便', '便秘', '便祕', '去脂', '減脂', '消脂', '燃燒脂肪',
          '掰掰肉', '蝴蝶袖', '小腹婆', '纖體', '纖瘦', '塑身', '雕塑曲線', '效果更佳', '改善排便', '消化不良',
          '理想身材', '雕塑體型', '好身材'],
        '涉及影響生理機能或改變身體結構',
        '纖纖飲',
      ),
      // 理毛霜
      ...words(['去除毛髮', '除毛', '脫毛', '溶毛', '把毛髮變不見'], undefined, '理毛霜'),
      // 鎮定凝露
      ...words(['不過敏', '零過敏', '抗過敏', '舒緩過敏', '修護過敏', '過敏測試', '鎮靜劑', '鎮定劑'], undefined, '鎮定凝露'),
      // 私密洗、緊依偎
      ...words(
        ['酸鹼平衡', '減少感染', '反覆發炎', '告別紅腫搔癢', '私密乾癢', '反覆不適', '私密健康', '內陰可使用',
          '乾痛', '潤滑', '啟動酸防護', '澎潤'],
        undefined,
        '私密洗／緊依偎',
      ),
      // 腸道益生菌
      ...words(
        ['排便困難', '大腹便便', '小腹凸出', '清空便便', '清出壞菌', '增生好菌', '增加好菌', '促進好菌', '增強免疫',
          '免疫系統', '體內清道夫'],
        undefined,
        '腸道益生菌',
      ),
    ],
    required: [],
  },
  {
    id: 'xinpuli',
    name: '新普利',
    source: '文章規範（Google 文件）',
    banned: [
      ...words(['減肥', '減脂', '甩油', '體重', '體脂', '肥', '胖', '瘦', '身材'], '敏感字眼（身材類）'),
      { word: '體態', replace: '狀態／維持好狀態' },
      { word: '腸道失衡', replace: '消化道' },
      { word: '腸道', replace: '消化道' },
      { word: '腸胃', replace: '消化道' },
      { word: '代謝', replace: '刺激（看前後文）', note: '不能提器官' },
      { word: '胃酸', replace: '酸度（看前後文）', note: '不能提器官' },
      { word: '腹脹', replace: '脹痛' },
      { word: '口氣臭', replace: '說話有異味' },
      { word: '口腔', replace: '說話有異味（看前後文）' },
      { word: '睡不好', replace: '休息品質NG' },
      { word: '不好入睡', replace: '休息品質NG' },
      { word: '睡眠品質差', replace: '睡眠品質不優' },
      { word: '失眠', note: '失眠是病症，不能提' },
      { word: '免疫系統', note: '不能提' },
      { word: '延緩衰老', replace: '抗氧化' },
      { word: '水潤', note: '隱眼文章不能寫' },
      { word: '戴比較久', note: '隱眼文章不能寫' },
    ],
    required: [],
  },
  {
    id: 'bella',
    name: '貝拉整形外科',
    source: '文章素材／敏感詞（Google 文件）',
    banned: [
      ...words(['優惠', '推薦', '保證', '限期', '限量', '差價', '特價', '折扣'], '醫療機構不能招攬病人'),
    ],
    required: [
      { label: '療程但書', anyOf: ['個人體質', '體質而異', '體質影響'], hint: '要放「任何療程或手術皆會因個人體質影響而導致效果有所差異…」' },
      { label: '衛教聲明', anyOf: ['衛生教育', '衛教'], hint: '要放「網站內容僅作為衛生教育及醫療學術分享用途…」' },
      { label: '醫療風險提醒', anyOf: ['醫療風險', '潛在風險'], hint: '要放「網頁中所有內容治療項目皆有醫療風險…」' },
    ],
  },
];

// ── Jev 要問的題目（每句都問）─────────────────────────
// 題目用英文寫：Jev 以英文訓練為主，說明用英文判斷較穩，句子本身維持中文
type JevQuestion = { type: 'noul'; instructions: string; criteria: { true: string; false: string } };

export const JEV_CHECKS = [
  {
    key: 'medical_claim',
    label: '宣稱醫療效果',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence claim that a PRODUCT, treatment package or brand item can treat, prevent, cure or improve a disease, infection or medical condition (e.g. treats infection, anti-inflammatory, kills bacteria, antibacterial, prevents infection)?',
      criteria: {
        true: 'A product or product feature is presented as having a medical / disease-treating / disease-preventing / antibacterial effect.',
        false: 'General health education, advice to see a doctor, describing symptoms or medicine prescribed by doctors, citing research, or product mention without medical effect.',
      },
    },
  },
  {
    key: 'body_change',
    label: '改變身體機能',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence claim a PRODUCT changes body structure or physiological function (e.g. slimming, fat burning, tightens the vagina, regulates hormones, boosts immunity, rebalances flora, improves metabolism)?',
      criteria: {
        true: 'A product is claimed to change body structure or physiological function.',
        false: 'No such product claim.',
      },
    },
  },
  {
    key: 'solicitation',
    label: '招攬／促銷',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence try to solicit customers with promotions, discounts, limited-time or limited-quantity offers, price comparisons, recommendations to book now, or guarantees?',
      criteria: {
        true: 'Promotional solicitation: discount, limited offer, book-now push, price comparison or guarantee.',
        false: 'Neutral information without promotional solicitation.',
      },
    },
  },
  {
    key: 'exaggeration',
    label: '誇大／絕對用語',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence use absolute or exaggerated claims such as guaranteed, 100%, cure completely, never recur, most effective, number one, the only one?',
      criteria: { true: 'Contains absolute / exaggerated claims.', false: 'No absolute or exaggerated claims.' },
    },
  },
  {
    key: 'ai_contrast',
    label: 'AI 味反轉句',
    q: {
      type: 'noul',
      instructions:
        "Does this sentence use a rhetorical contrast pattern like 'not A but B' (不是…而是…) or 'not only A but also B' (不僅…更是…/不只…更…)?",
      criteria: { true: 'Uses the contrast / escalation pattern.', false: 'Does not use it.' },
    },
  },
] as const satisfies readonly { key: string; label: string; q: JevQuestion }[];

export type JevKey = (typeof JEV_CHECKS)[number]['key'];

// 檢查模式：法規（禁詞＋必備項目＋Jev 法規題）和 AI 味（只問 Jev 反轉句）分開跑，只問需要的題目
export type CheckMode = 'legal' | 'ai';
const MODE_KEYS: Record<CheckMode, JevKey[]> = {
  legal: ['medical_claim', 'body_change', 'solicitation', 'exaggeration'],
  ai: ['ai_contrast'],
};

// ── 抓文章、拆句 ────────────────────────────────────

// 從網址抓文章正文：優先找常見的文章容器，找不到才退回整個 body
// 文章區塊：標題（h1～h4）要另外標記，拆句時當作後面句子的段落脈絡給 Jev 判斷產品類別
export interface Block {
  text: string;
  heading: boolean;
}

export async function fetchArticleText(url: string): Promise<{ title: string; blocks: Block[] }> {
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) throw new Error(`抓取文章失敗：HTTP ${res.status}`);
  const root = parse(await res.text());
  const title = root.querySelector('h1')?.text.trim() || root.querySelector('title')?.text.trim() || '';

  const container =
    root.querySelector('.entry-content') || // WordPress
    root.querySelector('.Post-content') || // Shopline 部落格（class 大寫 P）
    root.querySelector('.post-content') ||
    root.querySelector('.article-content') ||
    root.querySelector('article') ||
    root.querySelector('main') ||
    root.querySelector('body') ||
    root; // HTML 結構不標準時 parser 找不到 body（She is 部落格就是），直接用整份文件

  // 砍掉不是正文的區塊（導覽、表單、按鈕、腳本）
  container
    .querySelectorAll('script, style, noscript, nav, header, footer, aside, form, button, iframe, svg')
    .forEach((el) => el.remove());

  const blocks: Block[] = [];
  for (const el of container.querySelectorAll('h1, h2, h3, h4, p, li, td, blockquote, figcaption')) {
    if (el.querySelector('p, li')) continue; // 外層容器（例如 li 裡包 p）交給內層處理，避免重複
    if (isLinkOnly(el)) continue; // 整段只有一個連結＝「前往購買>>」這種按鈕文字，不是正文
    const text = el.text.replace(/\s+/g, ' ').trim();
    if (!text || /\{\{.*\}\}/.test(text)) continue; // 前端模板碼（Shopline 的 {{ ... | translate }}），不是正文
    blocks.push({ text, heading: /^h[1-4]$/i.test(el.tagName) });
  }
  return { title, blocks };
}

// 區塊文字幾乎都是連結文字（按鈕、延伸閱讀），當作非正文
function isLinkOnly(el: NHTMLElement): boolean {
  const all = el.text.replace(/\s+/g, '');
  if (!all) return true;
  const linkText = el.querySelectorAll('a').map((a) => a.text.replace(/\s+/g, '')).join('');
  return linkText.length / all.length > 0.9;
}

// 貼上的純文字：一行一個區塊
export function textToBlocks(text: string): Block[] {
  return text
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => ({ text: t, heading: false }));
}

// 區塊再依句號／問號／驚嘆號切句，每句帶上所在段落的標題
export function splitSentences(blocks: Block[]): { text: string; heading: string }[] {
  const out: { text: string; heading: string }[] = [];
  let heading = '';
  for (const b of blocks) {
    if (b.heading) heading = b.text;
    // 句尾標點後面緊接的右引號跟著前一句（「…會自己好嗎？」的「」」不能落到下一句開頭）
    for (const s of b.text.split(/(?<=[。！？!?][」』”]?)(?![」』”])/)) {
      const t = s.trim();
      if (t.length >= 4) out.push({ text: t, heading });
    }
  }
  return out;
}

// ── 禁詞＋必備項目（程式比對）──────────────────────────

export interface BannedHit {
  word: string;
  replace?: string;
  note?: string;
  group?: string;
}

export function findBanned(sentence: string, banned: BannedWord[]): BannedHit[] {
  // 長詞優先：「腸道失衡」命中時就不再報被它包住的「腸道」
  const sorted = [...banned].sort((a, b) => b.word.length - a.word.length);
  const hits: BannedHit[] = [];
  const covered: [number, number][] = [];
  for (const b of sorted) {
    let from = 0;
    let idx: number;
    while ((idx = sentence.indexOf(b.word, from)) !== -1) {
      const end = idx + b.word.length;
      const inside = covered.some(([s, e]) => idx >= s && end <= e);
      if (!inside && !isException(sentence, idx, b)) {
        covered.push([idx, end]);
        if (!hits.some((h) => h.word === b.word)) hits.push({ word: b.word, replace: b.replace, note: b.note, group: b.group });
      }
      from = end;
    }
  }
  return hits;
}

// 命中處是不是落在例外詞裡（例如「塑身」在「塑身衣」裡）
function isException(sentence: string, idx: number, b: BannedWord): boolean {
  return (b.except ?? []).some((ex) => {
    const offset = ex.indexOf(b.word);
    return offset !== -1 && sentence.startsWith(ex, idx - offset);
  });
}

// 使用者在畫面上補的禁詞：一行一個，可寫「禁詞=>替換詞」
export function parseExtraBanned(text: string): BannedWord[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [word, replace] = line.split(/=>|→/).map((s) => s.trim());
      return { word, replace: replace || undefined, note: '自訂禁詞' };
    })
    .filter((b) => b.word);
}

export function checkRequired(fullText: string, required: RequiredItem[]) {
  return required.map((r) => ({ label: r.label, hint: r.hint, ok: r.anyOf.some((k) => fullText.includes(k)) }));
}

// ── Jev（OpenRouter decisions API）─────────────────────

const JEV_MODEL = 'typesafe/jev-1.13';
const JEV_CONCURRENCY = 10; // 實測 10 併發 443 句約 50 秒，一篇文章百來句約 10 秒

type JevScores = Partial<Record<JevKey, number>>;

// 產品類別題（choice）：同一個「抗菌」放在內褲和清潔液上合法性不同，要先知道句子在講哪類產品
// 實測（Relove 文章 8 句）有段落標題當脈絡時，講到產品的句子類別都判對、信心 0.83～1；一般衛教句信心低
const CATEGORY_QUESTION = {
  type: 'choice',
  instructions: 'Which kind of product is THIS sentence describing or making a claim about? Use the section heading as context.',
  criteria: {
    cosmetic: 'Skin/hair/intimate cleanser, gel, lotion, mask, shampoo, wipes, perfume, hair-removal cream (cosmetics).',
    food: 'Supplement, probiotic capsule, drink, vitamin, collagen, any food eaten or drunk.',
    textile: 'Underwear, panties, clothing, fabric.',
    laundry: 'Laundry detergent or hand-wash liquid for washing clothes/underwear.',
    none: 'Not about a specific product (general health education, habits, symptoms, advice).',
  },
};
const CATEGORY_MIN_CONFIDENCE = 0.6; // 類別信心低於這個值就當作「沒在講產品」

async function askJev(
  sentence: string,
  heading: string,
  keys: JevKey[],
  withCategory: boolean,
  apiKey: string,
): Promise<{ scores: JevScores; category: ProductCategory; cost: number }> {
  const checks = JEV_CHECKS.filter((c) => keys.includes(c.key));
  const questions: Record<string, unknown> = Object.fromEntries(checks.map((c) => [c.key, c.q]));
  if (withCategory) questions.category = CATEGORY_QUESTION;
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: {
      article_language: 'Traditional Chinese',
      context: 'marketing article / blog post written for a brand or clinic in Taiwan',
      section_heading: heading,
      sentence,
    },
    questions,
  });

  // 偶發失敗重試兩次
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}：${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const data = (await res.json()) as {
        answers?: Record<string, { noul?: number; choice?: string; confidence?: number }>;
        usage?: { cost?: number };
      };
      const scores: JevScores = {};
      for (const c of checks) {
        const v = data.answers?.[c.key]?.noul;
        if (typeof v === 'number') scores[c.key] = v;
      }
      const cat = data.answers?.category;
      const category: ProductCategory =
        cat?.choice && cat.choice in CATEGORY_LABELS && (cat.confidence ?? 0) >= CATEGORY_MIN_CONFIDENCE
          ? (cat.choice as ProductCategory)
          : 'none';
      return { scores, category, cost: data.usage?.cost ?? 0 };
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`Jev 呼叫失敗：${lastErr}`);
}

// ── 主流程 ───────────────────────────────────────────

export interface SentenceResult {
  text: string;
  banned: BannedHit[];
  jev: JevScores; // 各題「是」的機率 0～1
  category: ProductCategory; // Jev 判斷這句在講哪類產品（法規模式才判）
  allowed: string[]; // 句子裡出現、且在該類別官方明列可用的詞句
  jevError?: boolean;
}

export interface ComplianceReport {
  title: string;
  client: string;
  sentenceCount: number;
  required: { label: string; hint: string; ok: boolean }[];
  sentences: SentenceResult[];
  cost: number; // Jev 花費（美元）
  jevFailed: number; // Jev 判斷失敗的句數
}

const MAX_SENTENCES = 400; // 超過就截斷，避免一次跑太久撞到閘道逾時

export async function runComplianceCheck(opts: {
  mode: CheckMode;
  blocks: Block[];
  title: string;
  ruleSet: ClientRuleSet;
  extraBanned: BannedWord[];
}): Promise<ComplianceReport> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY 環境變數');

  const sentences = splitSentences(opts.blocks).slice(0, MAX_SENTENCES);
  const legal = opts.mode === 'legal';
  // AI 味模式不比對禁詞；法規模式＝官方準則禁詞＋客戶禁詞＋自訂禁詞
  const banned = legal ? [...OFFICIAL_BANNED, ...opts.ruleSet.banned, ...opts.extraBanned] : [];

  const results: SentenceResult[] = sentences.map((s) => ({
    text: s.text,
    banned: findBanned(s.text, banned),
    jev: {},
    category: 'none',
    allowed: [],
  }));

  // 併發呼叫 Jev：固定數量的 worker 輪流領下一句
  let cost = 0;
  let jevFailed = 0;
  let next = 0;
  const worker = async () => {
    while (next < results.length) {
      const i = next++;
      try {
        const r = await askJev(results[i].text, sentences[i].heading, MODE_KEYS[opts.mode], legal, apiKey);
        results[i].jev = r.scores;
        results[i].category = r.category;
        results[i].allowed = ALLOWED_BY_CATEGORY[r.category].filter((w) => results[i].text.includes(w));
        cost += r.cost;
      } catch {
        results[i].jevError = true;
        jevFailed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JEV_CONCURRENCY, results.length) }, worker));

  return {
    title: opts.title,
    client: opts.ruleSet.name,
    sentenceCount: sentences.length,
    required: legal ? checkRequired(opts.blocks.map((b) => b.text).join('\n'), opts.ruleSet.required) : [],
    sentences: results,
    cost,
    jevFailed,
  };
}
