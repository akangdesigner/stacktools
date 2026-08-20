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
