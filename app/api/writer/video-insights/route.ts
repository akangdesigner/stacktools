import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

// 單支萃取：每支影片各送一次 AI，避免多份一起送時注意力被稀釋、每支只剩一條
const SYSTEM_PROMPT = `你是一位資深內容策略顧問。使用者會給你「一支」影片/音檔的逐字稿，以及一份「大眾文章已涵蓋內容」對照基準（mainstreamContext，代表網路上同主題文章普遍會講的東西）。

你的任務：從這支逐字稿裡「精選」2~3 個「最獨家、最有料」的觀點。這些觀點通常來自講者的第一手經驗、實務操作細節、業界內幕、具體數字、反直覺的判斷，能讓文章展現真實經驗與專業（EEAT）。

做法（重要）：
- 只挑「最值得寫進文章」的 2~3 個（最多 3 個，不要超過）。優先選有第一手經驗、具體數字、反直覺判斷的，相對普通、人人會講的就捨棄。
- 寧可少而精：不要把逐字稿裡有講到的全部列出來，挑出最精華的就好。
- 每個觀點各自獨立、聚焦，不要硬合併成一條籠統的。

底線：
- 只抽「逐字稿裡真的有講」的內容，嚴禁自行腦補或補充逐字稿沒提到的東西。
- 只有與 mainstreamContext「字面上幾乎一模一樣」的才排除；只要講者有補上自己的數字、經驗或細節，就算獨家、可入選。
- 真的整支都很空泛、毫無具體內容時，才回少於 2 條或空陣列。

請「只」回傳一個 JSON 陣列，不要加任何說明文字或 markdown 標記：
[
  {
    "viewpoint": "用一兩句話清楚講出這個獨家觀點本身（精煉成書面語，去掉口語贅字，但不可扭曲原意）",
    "whyRare": "為什麼大眾文章少提這點（一句話，例如：需要實際操作過才知道、與常見說法相反、業界才懂的細節）"
  }
]
找不到任何夠獨家的觀點就回傳空陣列 []。`;

type TranscriptInput = { filename?: string; transcript?: string };
type RawInsight = { viewpoint: string; whyRare: string };

// 對單支逐字稿呼叫 AI，回傳該支的觀點（失敗則回 []，不拖累其他支）
async function extractForOne(
  apiKey: string,
  model: string,
  transcript: string,
  keyword: string,
  mainstreamContext: string,
): Promise<RawInsight[]> {
  const userMessage = [
    keyword ? `文章關鍵字：${keyword}` : '',
    mainstreamContext
      ? `【大眾文章已涵蓋內容（對照基準，這些不算獨家）】\n${mainstreamContext.slice(0, 8000)}`
      : '',
    `【這支影片的逐字稿】\n${transcript.slice(0, 24000)}`,
  ].filter(Boolean).join('\n\n');

  let upstream: Response;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://stack.zeabur.app',
        'X-Title': 'Stacktools Writer',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2000, // 每支獨立輸出，留足 2~3 條的空間，避免被截斷
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch {
    return [];
  }

  if (!upstream.ok) return [];

  const data = await upstream.json().catch(() => null);
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    return (Array.isArray(parsed) ? parsed : [])
      .map(raw => {
        const item = raw as Record<string, unknown>;
        const viewpoint = typeof item.viewpoint === 'string' ? item.viewpoint.trim() : '';
        if (!viewpoint) return null;
        return { viewpoint, whyRare: typeof item.whyRare === 'string' ? item.whyRare.trim() : '' };
      })
      .filter((x): x is RawInsight => x !== null)
      .slice(0, 3); // 每支最多取 3 條，硬性上限（避免模型一次給太多）
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' }, { status: 500 });
  }

  let payload: { transcripts?: TranscriptInput[]; keyword?: string; mainstreamContext?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const transcripts = (payload.transcripts ?? []).filter(t => t?.transcript?.trim());
  if (transcripts.length === 0) {
    return NextResponse.json({ error: '沒有可用的逐字稿，請先完成轉錄' }, { status: 400 });
  }

  const keyword = (payload.keyword ?? '').trim();
  const mainstreamContext = (payload.mainstreamContext ?? '').trim();

  const settings = getSettings();
  const model = settings.openrouter_model || 'openai/gpt-4o-mini';

  // 逐支「依序」萃取（不可並行）：同時打多個請求時 OpenRouter 會降級/截短某一支，導致觀點縮水。
  // 來源由後端標定（用該支 filename），保證不會標錯或全歸到同一支。
  const perVideo: { filename: string; items: RawInsight[] }[] = [];
  for (let i = 0; i < transcripts.length; i++) {
    const t = transcripts[i];
    const items = await extractForOne(apiKey, model, t.transcript ?? '', keyword, mainstreamContext);
    perVideo.push({ filename: t.filename ?? `影片 ${i + 1}`, items });
  }

  let n = 0;
  const insights = perVideo.flatMap(({ filename, items }) =>
    items.map(it => ({ id: `v${++n}`, viewpoint: it.viewpoint, sourceFile: filename, whyRare: it.whyRare })),
  );

  return NextResponse.json({ insights });
}
