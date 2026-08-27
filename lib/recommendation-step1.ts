import {
  applyStageResult,
  RecommendationJobInput,
  RecommendationBrand,
} from './recommendation-jobs';

const MODEL = 'anthropic/claude-haiku-4.5';

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
    findOfficialUrls(jobId, input, updated.data.brands).catch(() => {});
  }
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
      `${input.searchTerm} 衛福部`,
      `${input.searchTerm} 食藥署`,
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

    const outlinePrompt = `你是一個精準的文章結構生成器。你的輸出將直接被程式解析，嚴禁包含任何自然語言描述、開場白、Markdown 代碼塊或結尾建議，嚴禁生成任何文章內容。

請針對主題：${input.title} 輸出精確的目錄結構。

目錄生成規則：

前言
這一級標題要傳達「怎麼找到高 CP 值的${input.searchTerm}」這個概念，用你覺得最適合這個主題、讀起來自然的講法命名，不要固定套用「如何尋找高CP值的XXX」這句型。標題必須具體易懂，禁止用「框架」「機制」「策略」「要素」「原則」這類抽象包裝詞收尾，也不要用冒號接抽象詞組。這一章的內文只教讀者怎麼自己判斷、怎麼比較，不會列出具體品牌名單，標題絕對不可暗示這一章會列出/推薦具體品牌（禁用「推薦品牌」「必看十家」「202X推薦」這類字眼）。子項數量依主題實際情況判斷，建議 3～5 個，不要每次固定套用同一數字。
下含 1.1. 至 1.[N]。

FAQ
下含 2.1. 至 2.5.（相關常見問題）。

總結

輸出格式規範：
純文字輸出，嚴禁使用代碼塊，每一項獨立一行。
「前言」與「總結」這兩個一級標題禁止加任何數字前綴；其餘一級標題必須依序編號為 1. 2.，不可因為前言或總結而順延或跳號。二級標題使用 X.X.。
禁止輸出 HTML、禁止解釋、禁止內容描述。

參考來源資料
${references || '（無）'}`;

    const outlineRaw = await askOpenRouter(outlinePrompt, openrouterKey);
    outline = outlineRaw.trim();
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
        max_results: 6,
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

// n8n「品牌查詢」工作流不再找官方網址（原本的 query 常被熱銷型號污染搜不到官網），改本地直接查
// 品牌清單一到就觸發，跟 generateTitleSuggestions 同一套 fire-and-forget 模式
export async function findOfficialUrls(
  jobId: string,
  input: RecommendationJobInput,
  brands: RecommendationBrand[]
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';

  // brandsUrlReady 是進確認畫面的必要條件之一，每個品牌都用自己的 try/catch
  // 兜底（單一品牌查詢失敗不影響其他品牌），確保迴圈跑完一定會設成 true，
  // 不會卡在 researching 出不去
  //
  // 品牌逐一處理、不平行送出：Tavily 有短時間內請求數限流（跟月額度是兩回事），
  // 一次 Promise.all 把多個品牌同時炸出去會整批被限流打回空結果
  // （8/27 實測撞過，明明月額度還有 134 次，一次爆量還是整批失敗）
  const updated: RecommendationBrand[] = [];
  for (const brand of brands) {
    if (brand.official_url) {
      updated.push(brand);
      continue;
    }

    try {
      const results = await tavilySearch(`${brand.brand_name} ${input.searchTerm} 熱銷 推薦 官方`);
      if (!results.length) {
        updated.push(brand);
        continue;
      }

      const listText = results
        .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
        .join('\n\n');

      const prompt = `你是品牌官方網站驗證員。品牌名稱：「${brand.brand_name}」

搜尋結果：
${listText}

先從搜尋結果判斷這個品牌賣最好、最多人推薦的是「哪一款具體商品」，再挑出那一款商品的官方網址。這篇文章要能讓讀者點進去直接看到「這一款具體商品」進而購買，規則：
1. 最優先：品牌自己網域下、單一具體商品的產品詳情頁（頁面內容是規格/成分/價格/購買按鈕，網址通常帶產品代碼或型號）
2. 絕對不能選品牌首頁、系列列表頁、分類頁（網址含 collections/category/list/products 這種多品項列表特徵，或內容是條列多款商品而不是單一商品規格介紹）——這些都不算數，除非搜尋結果裡真的完全沒有任何單一商品頁，才可以退而求其次選首頁
3. 絕對不能選第三方電商平台（蝦皮、momo、PChome、樂天、Yahoo購物）即使頁面寫著「官方旗艦店」「官方授權店」也不行
4. 絕對不能選人力銀行網站（104、1111、518、cake.me、yes123）
5. 絕對不能選其他地區站台（.hk、.cn、海外站），只能選台灣站（.tw 或明確是台灣官方站）
6. 社群連結（FB/IG/LINE/Threads）只在完全沒有其他選項時才選
7. 找不到夠格的網址就回傳空字串，不要亂猜、不可自行修改品牌名稱

只回傳 JSON，不要有其他文字：{"official_url": "https://..."}`;

      const raw = await askOpenRouter(prompt, openrouterKey);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error(`[findOfficialUrls] ${brand.brand_name} AI 回傳沒有 JSON，原始內容：${raw.slice(0, 300)}`);
      }
      const parsed = match ? (JSON.parse(match[0]) as { official_url?: string }) : {};
      if (!parsed.official_url) {
        console.error(`[findOfficialUrls] ${brand.brand_name} AI 判斷無夠格網址，Tavily 結果數：${results.length}`);
      }
      updated.push({ ...brand, official_url: parsed.official_url || '' });
    } catch (err) {
      console.error(`[findOfficialUrls] ${brand.brand_name} 例外：`, err);
      updated.push(brand);
    }
  }

  applyStageResult(jobId, 'brands', { brands: updated, brandsUrlReady: true });
}
