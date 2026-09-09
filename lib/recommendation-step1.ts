import {
  applyStageResult,
  RecommendationJobInput,
  RecommendationBrand,
  RecommendationSubjectType,
} from './recommendation-jobs';

const MODEL = 'anthropic/claude-haiku-4.5';

// 大綱 LLM 偶爾會忘記幫第一個真正的章節標題加數字編號前綴（前言/總結不編號，
// 其餘一級標題本該依序編號 1. 2.），導致下游（n8n 的章節分類器）把裸標題整段
// 判成不明角色丟棄，底下的子項目變成沒有母標題的孤兒內容。這裡不靠 LLM 記得，
// 直接用程式碼偵測沒編號的裸標題並補上正確的章節編號。
// 大綱提示詞明文禁止「列出具體品牌名單」的章節，但 LLM 偶爾照樣生一章
// 「2026年五家口碑優質的OO公司 / 1.1. 第一家公司 …」出來。品牌清單是 n8n 用真實品牌卡片
// 另外組的章節，大綱再放一份就會重複，而且「第一家公司」這種代號會直接變成文章裡的 h3。
// 提示詞管不住就用程式擋：把這種章節連同子項整段拿掉，再交給 normalizeOutlineNumbering 重編號。
//
// 注意：不能用章節編號當 key。LLM 生出來的多餘章節常常跟正常章節撞號（實測撞過兩個「1.」），
// 用編號分組會把正常章節一起砍掉，所以這裡照行序切區塊。
const PLACEHOLDER_SUBITEM =
  /^\d+\.\d+\.?\s*(第[一二三四五六七八九十\d]+\s*(家|個|名)?\s*(公司|品牌|廠商|業者|店家|服務商)|(公司|品牌|廠商|業者|方案)\s*[A-Za-z甲乙丙丁戊]\s*$)/

const BRAND_LIST_HEADING =
  /^\d+\.\s*(?=.*(公司|品牌|廠商|業者|服務商|名單|合作夥伴))(?=.*(推薦|精選|嚴選|口碑|評比|排行|\d+\s*(家|款|大)))/

function isSubitem(line: string) {
  return /^\d+\.\d+\.?/.test(line)
}

function isChapterHeading(line: string) {
  return /^\d+\./.test(line) && !isSubitem(line)
}

function stripBrandListSections(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  // 依行序切成區塊：每個編號章節帶著它後面的子項，其餘（前言／總結）各自成塊
  type Block = { heading: string | null; subitems: string[]; loose: string[] }
  const blocks: Block[] = []
  let current: Block | null = null

  for (const line of lines) {
    if (isChapterHeading(line)) {
      current = { heading: line, subitems: [], loose: [] }
      blocks.push(current)
    } else if (isSubitem(line) && current) {
      current.subitems.push(line)
    } else {
      current = null
      blocks.push({ heading: null, subitems: [], loose: [line] })
    }
  }

  const kept: string[] = []
  for (const block of blocks) {
    if (block.heading === null) {
      kept.push(...block.loose)
      continue
    }

    const placeholders = block.subitems.filter((l) => PLACEHOLDER_SUBITEM.test(l)).length
    // 一半以上子項是「第N家公司」這種代號，或標題本身就是品牌名單 → 整章丟掉
    const isBrandList =
      (block.subitems.length > 0 && placeholders * 2 >= block.subitems.length) ||
      BRAND_LIST_HEADING.test(block.heading)
    if (isBrandList) continue

    kept.push(block.heading)
    // 章節留著，但個別代號子項還是要拿掉
    kept.push(...block.subitems.filter((l) => !PLACEHOLDER_SUBITEM.test(l)))
  }

  return kept.join('\n')
}

function normalizeOutlineNumbering(raw: string): string {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  type Classified = { text: string; role: 'summary' | 'intro' | 'subitem' | 'chapterHeading' | 'unknown'; chapterNum?: number };

  function classify(line: string): Omit<Classified, 'text'> {
    if (/總結|結論/.test(line)) return { role: 'summary' };
    if (/前言/.test(line)) return { role: 'intro' };

    const subMatch = line.match(/^(\d+)\.(\d+)\.?/);
    if (subMatch) return { role: 'subitem', chapterNum: Number(subMatch[1]) };

    const headingMatch = line.match(/^(\d+)\.\s+/);
    if (headingMatch) return { role: 'chapterHeading', chapterNum: Number(headingMatch[1]) };

    return { role: 'unknown' };
  }

  const classified: Classified[] = lines.map((line) => ({ text: line, ...classify(line) }));

  for (let i = 0; i < classified.length; i++) {
    if (classified[i].role !== 'unknown') continue;
    const next = classified.slice(i + 1).find((c) => c.role === 'subitem');
    if (next && next.chapterNum !== undefined) {
      classified[i].text = `${next.chapterNum}. ${classified[i].text}`;
    }
  }

  return classified.map((c) => c.text).join('\n');
}

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools Recommendation',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter 錯誤：${err}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

// n8n「品牌查詢」工作流回傳品牌清單後觸發，本地補生成標題建議（n8n 端沒有這個環節）
export async function generateTitleSuggestions(
  jobId: string,
  input: RecommendationJobInput,
  brands: RecommendationBrand[]
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const brandNames = brands.map((b) => b.brand_name).filter(Boolean).slice(0, 8).join('、');

  const currentYear = new Date().getFullYear();

  const prompt = `這是一篇推薦型文章，搜尋主題：「${input.searchTerm}」，主要關鍵字：「${input.keywords}」。
使用者原本輸入的標題參考：「${input.title}」
調查到的相關品牌：${brandNames || '（無）'}
現在是西元 ${currentYear} 年。

請依據以上資訊，提出 3 個更有吸引力、符合推薦型文章慣例（例如「精選/推薦 N 家」「怎麼選」「完整比較」等）的標題建議，主題要與原標題一致。若標題要放年份，只能用 ${currentYear}，不可使用其他年份。

只回傳 JSON 陣列，不要有其他文字：
["標題1", "標題2", "標題3"]`;

  let titleSuggestions: string[] = [];
  try {
    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`標題建議 AI 回傳格式錯誤：${raw.slice(0, 200)}`);
    titleSuggestions = JSON.parse(match[0]) as string[];
  } catch {
    // 標題建議是加分功能，失敗不擋流程，使用者仍可手動編輯標題
    titleSuggestions = [];
  }

  applyStageResult(jobId, 'brands', { titleSuggestions });
}

// 品牌查詢／大綱生成改本地跑（原本靠 n8n agent 多輪工具呼叫，8/27 實測搜尋不足時只會保守回傳指定品牌，
// 其他品牌抓不到；本地固定用 1~2 次 Tavily 搜尋＋單次 AI 篩選取代，跟 findOfficialUrls 同一套模式）
export async function generateBrands(
  jobId: string,
  input: RecommendationJobInput
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  let brands: RecommendationBrand[] = [];
  let backupBrands: string[] = [];

  try {
    const countPrompt = `根據文章標題判斷這篇文章預計要介紹幾個品牌（N），用自然語意理解，不要死板比對。
判斷原則：
- 「12大益生菌推薦」→ 12
- 「TOP 8 膠原蛋白品牌」→ 8
- 「前10名葉黃素推薦」→ 10
- 「5款女生球鞋推薦」→ 5
- 「8種熱門洗髮精比較」→ 8
注意：年份、價格、容量、規格數字都不是品牌數量；標題沒有明確數量就輸出 10。

標題：${input.title}

只回傳數字，不要有其他文字。`;
    const countRaw = await askOpenRouter(countPrompt, openrouterKey);
    const n = Math.max(1, Math.min(30, parseInt(countRaw.match(/\d+/)?.[0] || '10', 10) || 10));

    const queries = [input.searchTerm, `${input.searchTerm} 品牌 推薦`];
    const collected: TavilyResult[] = [];
    for (const q of queries) {
      collected.push(...(await tavilySearch(q)));
    }
    const seen = new Set<string>();
    const results = collected.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    if (!results.length) throw new Error('Tavily 搜尋沒有結果');

    const listText = results
      .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
      .join('\n\n');

    const prompt = `你是一位品牌資料研究員，工作是根據搜尋主題，從下方搜尋結果中找出真實存在且高度相關的品牌名稱。

禁止：使用你自己的記憶直接回答、幻想品牌、輸出網址、輸出產品名稱或系列名稱。所有品牌都必須來自下方搜尋結果。

文章標題：${input.title}
搜尋主題：${input.searchTerm}
指定品牌：${input.requiredBrand || '（無）'}
品牌總數 N：${n}

搜尋結果：
${listText}

品牌規則：
- 只保留真實存在的品牌主名稱，不可是商品名稱、子系列名稱、型號名稱
- 除非主題本身是 B2B／餐飲原料／專業設備情境，否則只保留一般消費者實際能買到的品牌，排除純批發／餐飲通路原料供應商
- 同品牌不同系列、英文縮寫、子品牌視為同一品牌，只保留一筆
- 指定品牌必須保留（如果有指定的話）

數量規則：
- 正式品牌（is_backup: false）最多 N 個，不可超過，搜尋結果不足可以少於 N，禁止硬湊
- 備選品牌（is_backup: true）最多再列 3 個真實相關但沒進正式名單的品牌，沒有就是 0 個

只回傳 JSON 陣列，不要有其他文字：
[{"brand_name": "品牌名稱", "is_backup": false}]`;

    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`品牌 AI 回傳格式錯誤：${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { brand_name?: string; is_backup?: boolean }[];

    const dedupedNames = new Set<string>();
    const primary: string[] = [];
    const backup: string[] = [];
    for (const item of parsed) {
      const name = String(item?.brand_name ?? '').trim();
      if (!name || dedupedNames.has(name)) continue;
      dedupedNames.add(name);
      if (item?.is_backup) backup.push(name);
      else primary.push(name);
    }

    // 指定品牌必須保留：不在正式名單就補進去，頂掉最後一個非指定品牌維持不超過 N
    if (input.requiredBrand && !primary.includes(input.requiredBrand)) {
      if (primary.length >= n && n > 0) primary.pop();
      primary.unshift(input.requiredBrand);
    }

    brands = primary.slice(0, n || primary.length).map((name) => ({ brand_name: name, official_url: '' }));
    backupBrands = backup.slice(0, 3);
  } catch (err) {
    console.error(`[generateBrands] jobId=${jobId} 例外：`, err);
    // 兜底：至少保留指定品牌，避免流程卡死在 researching
    brands = input.requiredBrand ? [{ brand_name: input.requiredBrand, official_url: '' }] : [];
    backupBrands = [];
  }

  const updated = applyStageResult(jobId, 'brands', { brands, backupBrands });
  if (updated?.data.brands) {
    generateTitleSuggestions(jobId, input, updated.data.brands).catch(() => {});
    generateTags(jobId, input, updated.data.brands).catch(() => {});
    findOfficialUrls(jobId, input, updated.data.brands).catch(() => {});
  }
}

// 標籤是 spaceA 前端「主題篩選」跟卡片顯示用的，跟品牌清單同一時間點觸發生成，
// 一篇文章建議 3-5 個，不是每篇打一個代表性標籤，讓小積木在確認畫面看到建議後可以直接改
export async function generateTags(
  jobId: string,
  input: RecommendationJobInput,
  brands: RecommendationBrand[]
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const brandNames = brands.map((b) => b.brand_name).filter(Boolean).slice(0, 8).join('、');

  const prompt = `這是一篇推薦型文章，標題：「${input.title}」，搜尋主題：「${input.searchTerm}」，主要關鍵字：「${input.keywords}」。
文中會提到的品牌／公司：${brandNames || '（無）'}

請提出 3 到 5 個適合當這篇文章「標籤」的關鍵詞，標籤是用來在網站的主題篩選跟相關文章推薦用的，要跟這篇主題直接相關、具體、簡短（2-6 個字），不要跟文章標題重複太多字、也不要是空泛的詞（例如「推薦」「精選」本身不能當標籤）。

只回傳 JSON 陣列，不要有其他文字：
["標籤1", "標籤2", "標籤3"]`;

  let tags: string[] = [];
  try {
    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`標籤建議 AI 回傳格式錯誤：${raw.slice(0, 200)}`);
    tags = (JSON.parse(match[0]) as string[]).map((t) => String(t || '').trim()).filter(Boolean);
  } catch (err) {
    console.error(`[generateTags] jobId=${jobId} 例外：`, err);
    // 標籤建議是加分功能，失敗不擋流程，使用者仍可在確認畫面手動輸入
    tags = [];
  }

  applyStageResult(jobId, 'brands', { tags });
}

// 大綱生成改本地跑，規則跟 n8n「推薦文-2-大綱生成」workflow 一致：
// 只找政府機關／學術論文等級來源當參考，不能用推薦文/媒體文章
export async function generateOutline(
  jobId: string,
  input: RecommendationJobInput
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  let outline = '';
  let references = '';

  try {
    const queries = [
      `${input.searchTerm} 政府機關 官方資料`,
      `${input.searchTerm} 主管機關 公告`,
      `${input.searchTerm} 學術研究`,
    ];
    const collected: TavilyResult[] = [];
    for (const q of queries) {
      collected.push(...(await tavilySearch(q)));
    }
    const seen = new Set<string>();
    const results = collected.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    let sources: { title?: string; url?: string; content?: string }[] = [];
    if (results.length) {
      const listText = results
        .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
        .join('\n\n');

      const filterPrompt = `你是一個嚴謹的參考資料篩選員，只能從下方搜尋結果中挑出「政府機關」或「公開學術論文」等級的權威來源，絕對不可以選推薦文/評比文/一般新聞媒體/部落格/開箱文。

只能選：
1. 政府機關／公部門官方網站（衛福部、食藥署、教育部、經濟部、地方政府、國家統計資料、政府公告白皮書）
2. 公開學術論文／期刊研究（大學或研究機構期刊資料庫、學會研究報告，網址通常是 .edu／期刊平台／學術機構官網）

主題：${input.searchTerm}

搜尋結果：
${listText}

從中挑選最多 8 筆符合條件的來源；若不足 5 筆，就用現有符合條件的全部輸出，找不到符合條件的就回傳空陣列，不可以拿不符合的來源湊數。

只回傳 JSON 陣列，不要有其他文字：
[{"title": "頁面完整標題", "url": "https://完整網址", "content": "該頁面核心內容摘要，100-200字"}]`;

      const raw = await askOpenRouter(filterPrompt, openrouterKey);
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          sources = JSON.parse(match[0]);
        } catch {
          sources = [];
        }
      }
    }

    references = sources
      .map(
        (s, i) =>
          `[${i + 1}]\n參考文章標題：${(s.title || '').trim()}\n來源網址：${(s.url || '').trim()}\n參考摘要：${(s.content || '').trim()}`
      )
      .join('\n\n');

    // 這裡刻意不把 input.title 當主題餵進去。標題本身就是「OO怎麼選？2026推薦5家口碑優質合作夥伴」，
    // 模型看到「推薦5家」就會生一章「2026年五家口碑優質的OO公司 / 第一家公司…」出來。
    // 主題改用 searchTerm，標題只拿來對齊語氣；同時把一級標題寫成封閉清單，
    // 多生一章在規則上就是違規（原本的規則只描述標題該長怎樣，沒說不能再加）。
    //
    // 第 1 章的子項固定 3 個：n8n 工作流3 會把第 1 章當「判斷依據」章節，
    // 額外畫一張 SVG 圖卡，而那張卡寫死 3 欄、標題寫死「3 大挑選重點」
    // （見 取判斷依據標籤 的 slice(0, 3) 與 組SVG圖卡 的 buildCard('3 大挑選重點', ...)）。
    // 大綱給 4 個以上，內文會多寫幾段但圖卡只畫前 3 個，圖文對不起來。
    const outlinePrompt = `你是一個精準的文章結構生成器。你的輸出將直接被程式解析，嚴禁包含任何自然語言描述、開場白、Markdown 代碼塊或結尾建議，嚴禁生成任何文章內容。

主題：${input.searchTerm}
這篇文章的標題是「${input.title}」，僅供你抓語氣與讀者輪廓，不要照著標題的字面去安排章節。

這份大綱的一級標題是固定的封閉清單，只有這四個，順序也固定：

前言
1. （評估重點章，標題由你命名）
2. FAQ
總結

除了這四個之外不可以再有任何一級標題。這篇文章的具體品牌清單由系統另外用真實資料組成獨立章節，不經過這份大綱，所以整份大綱裡不會出現任何公司名、品牌名，也不會有「列出N家」性質的章節。

各章規則：

【前言】
就輸出「前言」這兩個字，不加編號、不加子項。

【第 1 章：評估重點】
標題由你命名，傳達「怎麼判斷一家${input.searchTerm}好不好」這個概念，用你覺得最適合這個主題、讀起來自然的講法，不要固定套用「如何尋找高CP值的XXX」這句型。標題必須具體易懂、是文法完整的句子，不要用「框架」「機制」「策略」「要素」「原則」這類抽象包裝詞收尾，也不要用冒號接抽象詞組。
這一章談的是讀者自己怎麼判斷、怎麼比較，子項標題只描述評估的面向或做法本身。
**子項固定 3 個（1.1. 1.2. 1.3.），不可多也不可少**——這一章會另外產出一張三欄式圖卡，欄位數是固定的。挑最重要的三個面向，不要為了湊數把相近的面向拆開。

【第 2 章：FAQ】
標題就是「FAQ」。子項 5 個（2.1. 至 2.5.），貼近讀者真的會搜尋的問句。

【總結】
就輸出「總結」這兩個字，不加編號、不加子項。

輸出格式規範：
純文字輸出，嚴禁使用代碼塊，每一項獨立一行。
「前言」與「總結」這兩個一級標題禁止加任何數字前綴；其餘一級標題必須依序編號為 1. 2.，不可因為前言或總結而順延或跳號。二級標題使用 X.X.。
禁止輸出 HTML、禁止解釋、禁止內容描述。

參考來源資料
${references || '（無）'}`;

    const outlineRaw = await askOpenRouter(outlinePrompt, openrouterKey);
    outline = normalizeOutlineNumbering(stripBrandListSections(outlineRaw.trim()));
    if (!outline) throw new Error('大綱 AI 回傳空白');
  } catch (err) {
    console.error(`[generateOutline] jobId=${jobId} 例外：`, err);
  }

  applyStageResult(jobId, 'outline', { outline, references });
}

type TavilyResult = { title: string; url: string; content: string };

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: false,
        max_results: 10,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: TavilyResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

// 單一品牌查官方網址，findOfficialUrls 的迴圈跟「新增/換上備選品牌」的即時查詢都共用這支
export async function findOfficialUrlForBrand(
  brandName: string,
  searchTerm: string,
  subjectType: RecommendationSubjectType,
  // 同一篇文章裡已經選定的其他品牌品項，用來讓後面的品牌盡量挑同類型的品項，
  // 不然會變成「洗顏膜 399 元」跟「精華液 3280 元」放在同一張比較表，讀者根本沒得比
  pickedTitles: string[] = []
): Promise<{ url: string; title: string }> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const empty = { url: '', title: '' };

  try {
    const results = await tavilySearch(`${brandName} ${searchTerm} 官網`);
    if (!results.length) return empty;

    const listText = results
      .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
      .join('\n\n');

    // 推薦對象由使用者在第一階段就選定，不再讓 AI 自己判斷商品/服務——
    // 產品類要的是「單一商品的產品頁」（後面 n8n 才抓得到真實商品圖），服務類要的是官網首頁
    const targetRules =
      subjectType === 'product'
        ? `這篇推薦的對象是「具體商品」。目標是這個品牌賣最好、最多人推薦的「那一款具體商品」的產品頁，讓讀者點進去直接看到那一款商品進而購買。

【產品頁規則】
1. 最優先：品牌自己網域下、單一具體商品的產品詳情頁（頁面內容是規格/成分/價格/購買按鈕，網址通常帶產品代碼或型號）
2. 絕對不能選品牌首頁、系列列表頁、分類頁——判斷依據是「內容是條列多款商品」而不是單純看網址關鍵字。常見的分類頁網址特徵是 /categories/、/category/、/collections/、/product-category/、/shop/、/search、/tag/
3. 注意：/products/商品名稱 這種網址在 Shopline、Shopify、CYBERBIZ 上就是「單一商品頁」，是最理想的選擇，不要因為看到 products 這個字就當成列表頁排除掉
4. 只有搜尋結果裡真的完全沒有任何單一商品頁，才可以退而求其次選首頁
5. 這個網址之後會被用來抓「該商品的商品圖」與規格，所以頁面主體必須就是那一款商品本身`
        : `這篇推薦的對象是「公司／服務」（行銷代操、顧問、教學、診所、施工、代理商等），沒有「規格/購買按鈕」這種商品頁概念。

【公司／服務規則】
1. 直接選品牌官方網站首頁或服務介紹頁即可，不用也不可能找到「單一商品頁」`;

    const sameTypeHint =
      subjectType === 'product' && pickedTitles.length
        ? `\n\n【同篇文章已選定的其他品牌品項】\n${pickedTitles.map((t) => `- ${t}`).join('\n')}\n這幾個品項會跟你這次選的放在同一張比較表互相比較，所以請盡量選「同一種品類」的商品（例如上面都是精華液，就不要選洗面乳、面膜或套組）。若該品牌真的沒有同品類商品，才選最接近主題的主力單品。`
        : '';

    const prompt = `你是品牌官方網站驗證員。品牌名稱：「${brandName}」
文章主題／要推薦的類型：「${searchTerm}」${sameTypeHint}

搜尋結果：
${listText}

${targetRules}

【不管哪一種都適用的規則】
- 絕對不能選其他人寫的部落格文章、評比文、比較文、心得文、新聞報導——即使文章掛在品牌自己的網域下（例如 xxx.com/blog/...），只要內容是「介紹知識／推薦清單」而不是「這個品牌的商品或服務本身」，就不算數
- 絕對不能選第三方電商平台（蝦皮、momo、PChome、樂天、Yahoo購物）即使頁面寫著「官方旗艦店」「官方授權店」也不行
- 絕對不能選人力銀行網站（104、1111、518、cake.me、yes123）
- 絕對不能選其他地區站台（.hk、.cn、海外站），只能選台灣站（.tw 或明確是台灣官方站）
- 社群連結（FB/IG/LINE/Threads）只在完全沒有其他選項時才選
- 找不到夠格的網址就回傳空字串，不要亂猜、不可自行修改品牌名稱

只回傳 JSON，不要有其他文字：{"official_url": "https://..."}`;

    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error(`[findOfficialUrlForBrand] ${brandName} AI 回傳沒有 JSON，原始內容：${raw.slice(0, 300)}`);
      return empty;
    }
    const parsed = JSON.parse(match[0]) as { official_url?: string };
    if (!parsed.official_url) {
      console.error(`[findOfficialUrlForBrand] ${brandName} AI 判斷無夠格網址，Tavily 結果數：${results.length}`);
      return empty;
    }
    // 標題直接從 Tavily 結果比對回來，不叫 AI 額外輸出，避免多一層幻覺風險
    const matchedResult = results.find((r) => r.url === parsed.official_url);
    return { url: parsed.official_url, title: matchedResult?.title || '' };
  } catch (err) {
    console.error(`[findOfficialUrlForBrand] ${brandName} 例外：`, err);
    return empty;
  }
}

// n8n「品牌查詢」工作流不再找官方網址（原本的 query 常被熱銷型號污染搜不到官網），改本地直接查
// 品牌清單一到就觸發，跟 generateTitleSuggestions 同一套 fire-and-forget 模式
export async function findOfficialUrls(
  jobId: string,
  input: RecommendationJobInput,
  brands: RecommendationBrand[]
): Promise<void> {
  // brandsUrlReady 是進確認畫面的必要條件之一，每個品牌都用自己的 try/catch
  // 兜底（單一品牌查詢失敗不影響其他品牌），確保迴圈跑完一定會設成 true，
  // 不會卡在 researching 出不去
  //
  // 品牌逐一處理、不平行送出：Tavily 有短時間內請求數限流（跟月額度是兩回事），
  // 一次 Promise.all 把多個品牌同時炸出去會整批被限流打回空結果
  // （8/27 實測撞過，明明月額度還有 134 次，一次爆量還是整批失敗）
  const updated: RecommendationBrand[] = [];
  const pickedTitles: string[] = [];
  for (const brand of brands) {
    if (brand.official_url) {
      updated.push(brand);
      if (brand.official_url_title) pickedTitles.push(brand.official_url_title);
      continue;
    }
    const { url, title } = await findOfficialUrlForBrand(
      brand.brand_name,
      input.searchTerm,
      input.subjectType,
      pickedTitles
    );
    updated.push({ ...brand, official_url: url, official_url_title: title });
    if (title) pickedTitles.push(title);
  }

  applyStageResult(jobId, 'brands', { brands: updated, brandsUrlReady: true });
}
