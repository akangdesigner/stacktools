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

// 找品牌賣最好/最多人推薦的具體商品名稱，避免官方網址搜尋隨便挑到不知名品項
// 回傳空字串代表沒查到可信的具體商品名（品牌名+類別重複這種無效型號會被擋掉）
async function findFlagshipProductName(
  brandName: string,
  searchTerm: string,
  openrouterKey: string
): Promise<string> {
  const results = await tavilySearch(`${brandName} ${searchTerm} 熱銷 推薦 評比`);
  if (!results.length) return '';

  const listText = results
    .map((r, i) => `${i + 1}. 標題：${r.title}\n內容摘要：${(r.content || '').slice(0, 300)}`)
    .join('\n\n');

  const prompt = `品牌名稱：「${brandName}」，商品類別：「${searchTerm}」

搜尋結果：
${listText}

從上面找出這個品牌最常被提到、賣最好或最多人推薦的「單一具體商品名稱」（例如完整品名，不是品牌名或類別本身）。

規則：
1. 商品名稱不能只是「品牌名+類別」的重複（例如品牌是「娘家」、類別是「益生菌」，就不能只回傳「娘家益生菌」這種沒有辨識度的組合，除非搜尋結果明確顯示這就是官方正式商品全名）
2. 找不到明確、有辨識度的具體商品就回傳空字串，不要亂猜

只回傳 JSON，不要有其他文字：{"product_name": "..."}`;

  try {
    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { product_name?: string }) : {};
    return (parsed.product_name || '').trim();
  } catch {
    return '';
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

  // brandsUrlReady 是進確認畫面的必要條件之一，這段無論如何都要走到最後把它設成 true，
  // 否則 Promise.all 整段炸掉會讓任務卡在 researching 出不去
  let updated = brands;
  try {
    updated = await Promise.all(
      brands.map(async (brand) => {
        if (brand.official_url) return brand;

        try {
          const flagship = await findFlagshipProductName(brand.brand_name, input.searchTerm, openrouterKey);
          const query = flagship
            ? `${brand.brand_name} ${flagship} 官方產品頁`
            : `${brand.brand_name} ${input.searchTerm} 產品 規格 價格`;
          const results = await tavilySearch(query);
          if (!results.length) return brand;

          const listText = results
            .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
            .join('\n\n');

          const prompt = `你是品牌官方網站驗證員。品牌名稱：「${brand.brand_name}」

搜尋結果：
${listText}

從上面挑出最符合的品牌官方網址，這篇文章要能讓讀者點進去直接看到「這一款具體商品」進而購買，規則：
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
          const parsed = match ? (JSON.parse(match[0]) as { official_url?: string }) : {};
          return { ...brand, official_url: parsed.official_url || '' };
        } catch {
          return brand;
        }
      })
    );
  } catch {
    updated = brands;
  }

  applyStageResult(jobId, 'brands', { brands: updated, brandsUrlReady: true });
}
