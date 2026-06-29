import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// AI 用便宜快速的 Haiku 即可，沿用推薦文工具的模型
const MODEL = 'anthropic/claude-haiku-4.5';

type TavilyResult = { title: string; url: string; content: string };
type TavilyResponse = { results?: TavilyResult[] };

// 搜尋意圖分組：每組底下一批關鍵字
type KeywordGroup = { intent: string; keywords: string[] };

// 先用 Tavily 搜尋種子關鍵字，把真實搜尋結果餵給 AI 當作發想素材
async function tavilySearch(query: string, apiKey: string): Promise<TavilyResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 10 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tavily 錯誤：${res.status}`);
  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools Keyword Planner',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, // 發想需要一點多樣性
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter 錯誤：${err}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export async function POST(req: NextRequest) {
  const { seed } = await req.json();
  const keyword = String(seed ?? '').trim();

  if (!keyword) {
    return NextResponse.json({ error: '請輸入種子關鍵字' }, { status: 400 });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!tavilyKey) return NextResponse.json({ error: '未設定 TAVILY_API_KEY' }, { status: 500 });
  if (!openrouterKey) return NextResponse.json({ error: '未設定 OPENROUTER_API_KEY' }, { status: 500 });

  try {
    // 搜尋種子關鍵字，蒐集真實搜尋結果當素材
    const results = await tavilySearch(`台灣 ${keyword}`, tavilyKey);
    const snippets = results
      .map((r, i) => `${i + 1}. 標題：${r.title}\n摘要：${r.content}`)
      .join('\n\n');

    const prompt = `你是台灣 SEO 關鍵字研究專家。請以「${keyword}」為種子關鍵字，發想並擴充出一批可用於內容行銷的相關關鍵字（含長尾關鍵字）。

請依「搜尋意圖」分成下列四組，每組產出 6～10 個關鍵字：
- 資訊型（想了解、學知識，例：是什麼、怎麼、原因、推薦）
- 比較型（想比較、選擇，例：比較、哪個好、評價、ptt、dcard）
- 導購型（接近購買、找產品/品牌/價格，例：價格、推薦品牌、團購、優惠）
- 在地型（地區、附近、門市、台灣縣市名）

要求：
- 全部使用繁體中文，貼近台灣人實際搜尋的說法
- 不要重複、不要只是把種子關鍵字加贅字
- 善用下方真實搜尋結果觀察使用者真正在找什麼

真實搜尋結果參考：
${snippets || '（無搜尋結果，請依你的知識發想）'}

只回傳 JSON，不要有其他文字或 markdown 標記：
{
  "groups": [
    { "intent": "資訊型", "keywords": ["...", "..."] },
    { "intent": "比較型", "keywords": ["...", "..."] },
    { "intent": "導購型", "keywords": ["...", "..."] },
    { "intent": "在地型", "keywords": ["...", "..."] }
  ]
}`;

    const raw = await askOpenRouter(prompt, openrouterKey);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`AI 回傳格式錯誤：${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { groups?: KeywordGroup[] };
    const groups = (parsed.groups ?? []).filter(
      (g) => g && typeof g.intent === 'string' && Array.isArray(g.keywords)
    );

    return NextResponse.json({ seed: keyword, groups });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
