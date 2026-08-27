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
          const results = await tavilySearch(`${brand.brand_name} ${input.searchTerm} 官方網站`);
          if (!results.length) return brand;

          const listText = results
            .map((r, i) => `${i + 1}. 標題：${r.title}\n網址：${r.url}\n內容摘要：${(r.content || '').slice(0, 300)}`)
            .join('\n\n');

          const prompt = `你是品牌官方網站驗證員。品牌名稱：「${brand.brand_name}」

搜尋結果：
${listText}

從上面挑出最符合的品牌官方網址，規則：
1. 優先選品牌自己網域的產品頁或首頁（例如 brand.com、brand.com.tw）
2. 絕對不能選第三方電商平台（蝦皮、momo、PChome、樂天、Yahoo購物）即使頁面寫著「官方旗艦店」「官方授權店」也不行
3. 絕對不能選人力銀行網站（104、1111、518、cake.me、yes123）
4. 社群連結（FB/IG/LINE/Threads）只在完全沒有其他選項時才選
5. 找不到夠格的網址就回傳空字串，不要亂猜、不可自行修改品牌名稱

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
