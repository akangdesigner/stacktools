import {
  applyStageResult,
  updateRecommendationJob,
  RecommendationJobInput,
} from './recommendation-jobs';

const MODEL = 'anthropic/claude-haiku-4.5';

async function tavilySearch(
  query: string,
  apiKey: string
): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 10 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tavily 錯誤：${res.status}`);
  const data = await res.json() as { results?: { title: string; url: string; content: string }[] };
  return data.results ?? [];
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

async function searchBrands(
  jobId: string,
  input: RecommendationJobInput,
  tavilyKey: string,
  openrouterKey: string
): Promise<void> {
  const results = await tavilySearch(
    `台灣 ${input.searchTerm} 推薦 品牌 官方網站`,
    tavilyKey
  );

  const snippets = results
    .map((r, i) => `${i + 1}. 標題：${r.title}\nURL：${r.url}\n摘要：${r.content}`)
    .join('\n\n');

  const prompt = `以下是搜尋「${input.searchTerm}」的結果。
請從中識別出 5～8 個台灣品牌，找出每個品牌的官方商品頁網址（直接賣商品的頁面，不是媒體報導或比較文章）。
${input.requiredBrand ? `注意：「${input.requiredBrand}」必須包含在結果中，若搜尋結果沒有請自行補上（official_url 填空字串）。` : ''}

搜尋結果：
${snippets}

只回傳 JSON 陣列，不要有其他文字：
[
  { "brand_name": "品牌名稱", "official_url": "https://..." },
  ...
]`;

  const raw = await askOpenRouter(prompt, openrouterKey);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`品牌查詢 AI 回傳格式錯誤：${raw.slice(0, 200)}`);
  const brands = JSON.parse(match[0]) as { brand_name: string; official_url: string }[];

  applyStageResult(jobId, 'brands', { brands });
}

async function generateOutline(
  jobId: string,
  input: RecommendationJobInput,
  openrouterKey: string
): Promise<void> {
  const prompt = `請為以下推薦型文章生成結構化大綱，使用 Markdown H2/H3 格式。

文章標題：${input.title}
主要關鍵字：${input.keywords}
搜尋主題：${input.searchTerm}

要求：
- 生成 4～6 個 H2 段落
- 每個 H2 下有 2～3 個 H3 小節
- 符合推薦型文章結構（簡介、選購重點、品牌介紹區、比較或Q&A、結論）
- 只回傳 Markdown 大綱，不要有其他說明文字

格式：
## H2標題
### H3小節
### H3小節
## 下一個H2
...`;

  const outline = await askOpenRouter(prompt, openrouterKey);
  applyStageResult(jobId, 'outline', { outline: outline.trim() });
}

export async function runRecommendationPhase1(
  jobId: string,
  input: RecommendationJobInput
): Promise<void> {
  const tavilyKey = process.env.TAVILY_API_KEY ?? '';
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';

  const [brandsRes, outlineRes] = await Promise.allSettled([
    searchBrands(jobId, input, tavilyKey, openrouterKey),
    generateOutline(jobId, input, openrouterKey),
  ]);

  const errors: string[] = [];
  if (brandsRes.status === 'rejected') errors.push(`品牌查詢：${String(brandsRes.reason)}`);
  if (outlineRes.status === 'rejected') errors.push(`大綱生成：${String(outlineRes.reason)}`);

  if (errors.length > 0) {
    updateRecommendationJob(jobId, 'failed', errors.join('；'));
  }
}
