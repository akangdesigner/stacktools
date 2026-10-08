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
  group?: string; // 出自哪個產品的規範：對應客戶 products 的 name，AI 判斷文章在講該產品才套；沒填＝每篇都套
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
  medical?: boolean; // 醫療機構客戶：才問「招攬／促銷」（食品／化粧品打折合法，不用問）
  // 客戶規範有依產品分的禁詞：AI 看文章判斷在講哪幾個產品，只套那幾個產品的禁詞
  // 新客戶照填就好：name 對應禁詞的 group，hint 寫產品是什麼（給 AI 認）
  products?: { name: string; hint: string }[];
  match?: string[]; // 自動認客戶：文章網址或內文出現這些字（網域、品牌名）就是這個客戶
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

// 產品類別：法規依類別分開管；一篇文章可能混好幾種產品，所以每個小標段落各判一次、每句套所在段落的規則
//   化粧品：化粧品衛生安全管理法＋認定準則
//   食品：食品安全衛生管理法＋認定準則
//   醫療器材：隱形眼鏡這類（目前只有客戶自己的禁詞）
//   紡織品：內褲、衣物，不歸化粧品法管，講抗菌、排濕是合法的
//   醫療院所：醫療法的醫療廣告規定，看客戶就知道（medical: true），不用 AI 判
export type Category = 'cosmetic' | 'food' | 'device' | 'textile' | 'medical';
export const CATEGORY_LABELS: Record<Category, string> = {
  cosmetic: '化粧品',
  food: '食品',
  device: '醫療器材',
  textile: '紡織品',
  medical: '醫療院所',
};

// 各類別「官方明列可用」的詞句：句子被 Jev 判高風險時，若含這些詞就標註可用讓人判斷
// 出處：化粧品認定準則附件二「通常得使用之詞句例示」（需有數據佐證）、食品認定準則附件一／二；紡織品不歸化粧品法管
export const ALLOWED_BY_CATEGORY: Record<Category, string[]> = {
  cosmetic: ['美白', '淨白', '改善暗沉', '保濕', '控油', '抗痘', '抗屑', '強健髮根', '弱酸',
    '緊緻毛孔', '收斂毛孔', '淨化毛孔', '通暢毛孔', '緊緻', '緊實', '彈性', '舒緩'],
  food: ['使排便順暢', '幫助維持消化道機能', '改變細菌叢生態', '調整體質', '養顏美容', '促進膠原蛋白形成', '營養補給'],
  device: [],
  textile: ['3A', 'AAA', '抗菌', '排濕', '透氣', '吸濕排汗'],
  medical: [],
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
    match: ['foreverrelove.com.tw', 'Relove'],
    products: [
      { name: '纖纖飲', hint: '纖體／體態管理飲品' },
      { name: '理毛霜', hint: '除毛膏' },
      { name: '鎮定凝露', hint: '肌膚鎮定、舒緩泛紅的保養凝露' },
      { name: '私密洗', hint: '私密處清潔液' },
      { name: '緊依偎', hint: '私密處緊緻保養凝膠' },
      { name: '腸道益生菌', hint: '益生菌保健食品' },
    ],
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
      // 私密洗
      ...words(
        ['酸鹼平衡', '減少感染', '反覆發炎', '告別紅腫搔癢', '私密乾癢', '反覆不適', '私密健康'],
        undefined,
        '私密洗',
      ),
      // 緊依偎
      ...words(['內陰可使用', '私密乾癢', '乾痛', '反覆不適', '潤滑', '啟動酸防護', '澎潤'], undefined, '緊依偎'),
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
    match: ['新普利'],
    products: [{ name: '隱眼', hint: '隱形眼鏡' }],
    banned: [
      ...words(['減肥', '減脂', '甩油', '體重', '體脂', '肥', '胖', '瘦', '身材'], '敏感字眼（身材類）'),
      { word: '體態', replace: '狀態／維持好狀態' },
      { word: '身體', replace: '狀態' },
      { word: '消化道不好', replace: '維持消化道健康' },
      { word: '腸道失衡', replace: '消化道' },
      { word: '腸道', replace: '消化道' },
      { word: '腸胃', replace: '消化道' },
      { word: '代謝', note: '看前後文換，不能提器官' },
      { word: '胃酸', note: '看前後文換，不能提器官' },
      { word: '腹脹', replace: '脹痛' },
      { word: '口氣臭', replace: '說話有異味' },
      { word: '口腔', note: '看前後文換，不能提器官' },
      { word: '睡不好', replace: '休息品質NG' },
      { word: '不好入睡', replace: '休息品質NG' },
      { word: '睡眠品質差', replace: '睡眠品質不優' },
      { word: '失眠', note: '失眠是病症，不能提' },
      { word: '免疫系統', note: '不能提' },
      { word: '良好思緒', note: '不能提' },
      { word: '延緩衰老', replace: '抗氧化' },
      { word: '水潤', note: '隱眼文章不能寫', group: '隱眼' },
      { word: '戴比較久', note: '隱眼文章不能寫', group: '隱眼' },
    ],
    required: [],
  },
  {
    id: 'bella',
    name: '貝拉整形外科',
    source: '文章素材／敏感詞（Google 文件）',
    match: ['貝拉整形', '貝拉診所'],
    medical: true,
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

// 自動認客戶：網址比網域、內文比品牌名，都沒中就回通用（只套官方準則）
export function detectClient(url: string, text: string): ClientRuleSet {
  return (
    CLIENT_RULES.find((c) => c.match?.some((m) => url.includes(m) || text.includes(m))) ?? CLIENT_RULES[0]
  );
}

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
  // ── AI 味題目：依小積木的去 AI 味規則（GitHub akangdesigner/qkangber docs/anti-ai-style.md）
  //    只收「看單句就能判斷」的類別；節奏、EEAT 要看整篇，不在這裡。規則改了要回來同步
  {
    key: 'ai_contrast',
    label: 'AI 味反轉句',
    q: {
      type: 'noul',
      instructions:
        "Does this sentence use a rhetorical contrast pattern: 'not A but B' (不是…而是…), 'not only A but also B' (不僅…更是…/不只…更…), or a positive statement ending with a tacked-on negation (…，不是…/…，而非…)?",
      criteria: { true: 'Uses the contrast / escalation / negation-ending pattern.', false: 'Does not use it.' },
    },
  },
  // A 類：報幕、教科書過渡詞、自我背書
  {
    key: 'ai_filler',
    label: 'AI 味報幕／過渡詞',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence contain an announcing or filler phrase that adds no information, such as textbook transitions (首先/其次/最後/然而/總而言之/值得注意的是/重要的是/深入探討), announcing what will be said (本文將/這篇會告訴你/帶你了解/接下來/舉例來說/簡單來說/一句話總結/說到底/說穿了/老實說/坦白說), or self-endorsement of credibility (以上資料皆經查證/都是我一家一家查的)?',
      criteria: {
        true: 'Contains an announcement, textbook transition or self-endorsement that could be deleted without losing information.',
        false: 'Goes straight to content; no such filler.',
      },
    },
  },
  // B 類：浮誇強調詞、給抽象事物套感官形容詞
  {
    key: 'ai_hype',
    label: 'AI 味浮誇詞',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence use inflated emphasis words instead of concrete facts, such as 至關重要/關鍵的/顯著/凸顯了/不可磨滅/觸目驚心/發人深省/耐人尋味, or sensory/emotional adjectives forced onto abstract things (a finding is 刺眼, numbers are 血淋淋)?',
      criteria: { true: 'Uses inflated emphasis words or forced sensory adjectives.', false: 'Plain, concrete wording.' },
    },
  },
  // C 類：社群情緒假詞、簡中技術黑話（「其實／很清楚／很簡單」小積木說還好，2026-09-29 拿掉）
  {
    key: 'ai_slang',
    label: 'AI 味社群假詞',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence use hollow social-media buzzwords such as 穩/撐/懂的都懂/接住/不繞/很現實, or the pit metaphors 踩坑/踩雷/避坑/填坑/入坑? Plain words like 其實/很清楚/很簡單 do NOT count.',
      criteria: { true: 'Uses hollow buzzwords or pit metaphors.', false: 'No such words (其實/很簡單 alone is fine).' },
    },
  },
  // D 類：標題的 AI 味（先搞懂、冒號＋斷言、懸念、殘句口號、做作比喻）
  {
    key: 'ai_heading',
    label: 'AI 味標題',
    q: {
      type: 'noul',
      instructions:
        "If this line is a heading or title, does it use an AI-style formula: telling the reader to 先搞懂/先了解/先看懂 first; a colon followed by a sensational verdict (…：根本不在同一個賽道); a suspense title that hides the content (…長什麼樣); a clipped slogan without subject or verb; a question plus dramatic fragment; or forced personification/metaphor (幫 Token 續命)? Answer false for normal body sentences.",
      criteria: {
        true: 'A heading written with one of these AI formulas.',
        false: 'Not a heading, or a plain complete heading that states its topic directly.',
      },
    },
  },
  // D 類：產品／成分／工具假擬人
  {
    key: 'ai_personify',
    label: 'AI 味假擬人',
    q: {
      type: 'noul',
      instructions:
        'Does this sentence personify a product, ingredient, formula, machine or AI tool as if it had will or hands, using verbs like 對付/衝著/顧到/追不上/管不到/搞定/應付/照顧/守護/幫你/出手, or attributing motives to it (得利/故意/它的目標是)?',
      criteria: { true: 'A product, ingredient or tool is personified or given motives.', false: 'Describes the thing and its effect plainly.' },
    },
  },
] as const satisfies readonly { key: string; label: string; q: JevQuestion }[];

export type JevKey = (typeof JEV_CHECKS)[number]['key'];

// 化粧品版「改變身體機能」：外觀效果是化粧品本來就能講的（附件二），只抓講到體內／細胞層級的
const COSMETIC_BODY_CHANGE: JevQuestion = {
  type: 'noul',
  instructions:
    'This is a COSMETIC article. Does this sentence claim a cosmetic product changes skin structure or internal physiological function, beyond surface appearance? Count: cells, rebuilding skin structure, collagen production, bacteria / flora balance, hormones, internal metabolism, activating hair follicles. Do NOT count appearance-level effects cosmetics may claim: tightening or refining pores, firmness, elasticity, moisturizing, brightening, oil control, removing dead skin, soothing.',
  criteria: {
    true: 'A cosmetic is claimed to change skin structure, cells, flora or internal physiology.',
    false: 'Only appearance-level cosmetic effects, or no product claim.',
  },
};

// 紡織品版「宣稱醫療效果」：布料抗菌、抑臭、排濕是合法的，只抓宣稱治療／預防疾病
const TEXTILE_MEDICAL: JevQuestion = {
  type: 'noul',
  instructions:
    'This sentence is about a TEXTILE product (underwear, clothing, fabric). Antibacterial fabric, anti-odor, moisture-wicking and breathability claims are PERMITTED for textiles. Does this sentence claim the textile treats, cures or prevents a disease or infection of the body?',
  criteria: {
    true: 'The textile is claimed to treat, cure or prevent a disease or infection.',
    false: 'Only fabric properties (antibacterial fabric, anti-odor, breathable, moisture-wicking) or no such claim.',
  },
};

// 這類產品要換掉的題目（其他類別用 JEV_CHECKS 原本的題目）
const CATEGORY_QUESTIONS: Partial<Record<Category, Partial<Record<JevKey, JevQuestion>>>> = {
  cosmetic: { body_change: COSMETIC_BODY_CHANGE },
  textile: { medical_claim: TEXTILE_MEDICAL },
};

// 檢查模式：法規（禁詞＋必備項目＋Jev 法規題）和 AI 味（只問 Jev 反轉句）分開跑，只問需要的題目
export type CheckMode = 'legal' | 'ai';
const MODE_KEYS: Record<CheckMode, JevKey[]> = {
  legal: ['medical_claim', 'body_change', 'solicitation', 'exaggeration'],
  ai: ['ai_contrast', 'ai_filler', 'ai_hype', 'ai_slang', 'ai_heading', 'ai_personify'],
};

// ── 抓文章、拆句 ────────────────────────────────────

// 從網址抓文章正文：優先找常見的文章容器，找不到才退回整個 body
// 文章區塊：標題（h1～h4）要另外標記，拆句時當作後面句子的段落脈絡給 Jev
export interface Block {
  text: string;
  heading: boolean;
}

export async function fetchArticleText(url: string): Promise<{ title: string; blocks: Block[] }> {
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) throw new Error(`抓取文章失敗：HTTP ${res.status}`);
  const html = await res.text();
  const page = parse(html);
  const title = page.querySelector('h1')?.text.trim() || page.querySelector('title')?.text.trim() || '';
  // 91APP 文章頁是前端渲染，內文藏在 window.nineyi.ServerData 的 Introduction（HTML 被轉成 &lt; 這種實體）
  const nineyi = html.match(/Introduction:"((?:[^"\\]|\\.)*)"/);
  const root = nineyi && html.includes('nineyi.ServerData') ? parse(decodeEntities(nineyi[1])) : page;

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

// 把 &lt; &gt; &quot; &amp; 這類 HTML 實體還原成字元（&amp; 放最後，避免 &amp;lt; 被解兩次）
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
// section＝第幾個段落（第一個小標之前是 0，每遇到一個小標 +1），用來對到該段的產品類別
export function splitSentences(blocks: Block[]): { text: string; heading: string; section: number }[] {
  const out: { text: string; heading: string; section: number }[] = [];
  let heading = '';
  let section = 0;
  for (const b of blocks) {
    if (b.heading) {
      heading = b.text;
      section++;
    }
    // 句尾標點後面緊接的右引號跟著前一句（「…會自己好嗎？」的「」」不能落到下一句開頭）
    for (const s of b.text.split(/(?<=[。！？!?][」』”]?)(?![」』”])/)) {
      const t = s.trim();
      if (t.length >= 4) out.push({ text: t, heading, section });
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

async function askJev(
  sentence: string,
  heading: string,
  keys: JevKey[],
  category: Category | null,
  apiKey: string,
): Promise<{ scores: JevScores; cost: number }> {
  const checks = JEV_CHECKS.filter((c) => keys.includes(c.key));
  const questions: Record<string, unknown> = Object.fromEntries(
    checks.map((c) => [c.key, (category && CATEGORY_QUESTIONS[category]?.[c.key]) || c.q]),
  );
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: {
      article_language: 'Traditional Chinese',
      context: 'marketing article / blog post written for a brand or clinic in Taiwan',
      ...(category && { product_category: CATEGORY_LABELS[category] }),
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
        answers?: Record<string, { noul?: number }>;
        usage?: { cost?: number };
      };
      const scores: JevScores = {};
      for (const c of checks) {
        const v = data.answers?.[c.key]?.noul;
        if (typeof v === 'number') scores[c.key] = v;
      }
      return { scores, cost: data.usage?.cost ?? 0 };
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
  category: Category | null; // 這句所在段落的產品類別（AI 味模式不判）
  allowed: string[]; // 句子裡出現、且在該類別官方明列可用的詞句
  jevError?: boolean;
}

export interface ComplianceReport {
  title: string;
  client: string;
  sentenceCount: number;
  required: { label: string; hint: string; ok: boolean }[];
  sentences: SentenceResult[];
  sections: SectionInfo[]; // 各段落判斷結果（AI 味模式是空的）
  cost: number; // Jev 花費（美元）
  jevFailed: number; // Jev 判斷失敗的句數
}

// 段落判斷結果：heading 空字串＝第一個小標之前的開頭
export interface SectionInfo {
  heading: string;
  category: Category;
  products: string[];
}

// 文章切成段落（第一個小標之前算第 0 段），跟 splitSentences 的 section 編號一致
function toSections(blocks: Block[]): { heading: string; text: string }[] {
  const out = [{ heading: '', text: '' }];
  for (const b of blocks) {
    if (b.heading) out.push({ heading: b.text, text: '' });
    else out[out.length - 1].text += b.text + '\n';
  }
  return out;
}

// 一次呼叫 AI 判斷每個段落在講哪類產品、客戶的哪幾個產品（客戶有分產品才問）
async function detectSections(
  title: string,
  blocks: Block[],
  products: { name: string; hint: string }[],
  apiKey: string,
): Promise<SectionInfo[]> {
  const sections = toSections(blocks);
  const sectionText = sections
    .map((sec, i) => `[${i}] 小標：${sec.heading || '（開頭）'}\n${sec.text.slice(0, 300)}`)
    .join('\n\n');
  const productPart = products.length
    ? `\n\n另外判斷每段主要在介紹或推銷客戶的哪幾個產品（可多選，都不是就空陣列，只是順帶提到的不算）：\n${products.map((p) => `- ${p.name}：${p.hint}`).join('\n')}`
    : '';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `文章標題：${title}\n\n下面是文章的每個段落。判斷每段在講的產品屬於哪一類：\n- cosmetic：化粧品（保養品、洗面乳、面膜、洗髮精、私密清潔液、除毛膏…）\n- food：食品（保健食品、益生菌、飲品、膠囊…）\n- device：醫療器材（隱形眼鏡…）\n- textile：紡織品（內褲、衣物…）\n- none：沒在講特定產品（一般衛教、習慣、症狀）${productPart}\n\n每段都要回，回傳 JSON：{"sections": [{"i": 段落編號, "category": "...", "products": ["產品名", ...]}]}\n\n${sectionText}`,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`判斷產品類別失敗：${data?.error?.message || `HTTP ${res.status}`}，請再按一次`);
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as {
    sections?: { i?: number; category?: string; products?: unknown }[];
  };
  if (!Array.isArray(parsed.sections)) throw new Error('判斷產品類別失敗，請再按一次');

  const names = products.map((p) => p.name);
  const isCat = (c: unknown): c is Category => c === 'cosmetic' || c === 'food' || c === 'device' || c === 'textile';
  const raw = sections.map((sec, i) => {
    const r = parsed.sections!.find((x) => x.i === i);
    return {
      heading: sec.heading,
      category: isCat(r?.category) ? r.category : null,
      products: Array.isArray(r?.products) ? r.products.filter((n): n is string => names.includes(n as string)) : [],
    };
  });
  // 一般衛教段落（none）沿用文章主要類別：出現最多次的類別，都沒有就當化粧品
  const counts = new Map<Category, number>();
  for (const r of raw) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cosmetic';
  return raw.map((r) => ({ ...r, category: r.category ?? main }));
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
  // 法規模式先判每段在講哪類產品、哪幾個產品：醫療院所看客戶就知道，其他交給 AI
  const sections: SectionInfo[] = !legal
    ? []
    : opts.ruleSet.medical
      ? toSections(opts.blocks).map((sec) => ({ heading: sec.heading, category: 'medical' as const, products: [] }))
      : await detectSections(opts.title, opts.blocks, opts.ruleSet.products ?? [], apiKey);

  // 每句套所在段落的規則：法規模式＝官方準則禁詞＋客戶通用禁詞＋該段產品的禁詞＋自訂禁詞；AI 味模式不比對禁詞
  const results: SentenceResult[] = sentences.map((s) => {
    const sec = sections[s.section];
    if (!sec) return { text: s.text, banned: [], jev: {}, category: null, allowed: [] };
    const clientBanned = opts.ruleSet.banned.filter((b) => !b.group || sec.products.includes(b.group));
    return {
      text: s.text,
      banned: findBanned(s.text, [...OFFICIAL_BANNED, ...clientBanned, ...opts.extraBanned]),
      jev: {},
      category: sec.category,
      allowed: ALLOWED_BY_CATEGORY[sec.category]
        .filter((w) => s.text.includes(w))
        .filter((w, _, hit) => !hit.some((o) => o !== w && o.includes(w))), // 「緊緻毛孔」命中就不另列「緊緻」
    };
  });

  // 非醫療客戶不問「招攬／促銷」：打折、買一送一對食品／化粧品是合法的
  const keys = MODE_KEYS[opts.mode].filter((k) => k !== 'solicitation' || opts.ruleSet.medical);

  // 併發呼叫 Jev：固定數量的 worker 輪流領下一句
  let cost = 0;
  let jevFailed = 0;
  let next = 0;
  const worker = async () => {
    while (next < results.length) {
      const i = next++;
      try {
        const r = await askJev(results[i].text, sentences[i].heading, keys, results[i].category, apiKey);
        results[i].jev = r.scores;
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
    sections,
    cost,
    jevFailed,
  };
}
