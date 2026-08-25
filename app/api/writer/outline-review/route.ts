import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 審稿 AI 可呼叫這個工具查即時網路資訊，核實內容的正確性與時效性
// （例如：交易所是否仍上架該幣種、法規或公告是否已變動、公司或產品是否仍在營運）
const TAVILY_TOOL = {
  type: 'function',
  function: {
    name: 'tavily_search',
    description: '搜尋即時網路資訊，用來核實文章內容的正確性與時效性。查詢字串請用具體、精確的關鍵字（例如「Pi Network OKX 上架 2026」而不是「Pi幣」）。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '要查詢的搜尋字串' } },
      required: ['query'],
    },
  },
};

type ToolCall = { id: string; function: { name: string; arguments: string } };
type Msg = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return '（伺服器未設定 TAVILY_API_KEY，無法查詢）';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', include_answer: false, max_results: 5 }),
    });
    if (!res.ok) return `查詢失敗：${await res.text()}`;
    const data = await res.json() as { results?: { title: string; url: string; content: string }[] };
    const results = data.results ?? [];
    if (results.length === 0) return '（查無相關結果）';
    return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content.slice(0, 400)}`).join('\n\n');
  } catch (e) {
    return `查詢失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

// 帶工具呼叫的審稿：AI 覺得需要就自己發起 tavily_search，最多來回 4 輪，
// 不開串流（工具迴圈用 SSE 太複雜），前端等完整結果一次回來
export async function POST(req: NextRequest) {
  const { messages, model } = await req.json() as { messages: Msg[]; model?: string };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' }, { status: 500 });
  }

  const convo: Msg[] = [...messages];
  const queriesUsed: string[] = [];
  const MAX_ROUNDS = 4;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://stack.zeabur.app',
        'X-Title': 'Stacktools Writer',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-5',
        messages: convo,
        tools: [TAVILY_TOOL],
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 4000,
      }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let msg: string;
      try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; }
      catch { msg = raw || String(upstream.status); }
      return NextResponse.json({ error: `OpenRouter 錯誤：${msg}` }, { status: upstream.status });
    }

    const data = await upstream.json() as { choices: { message: Msg }[] };
    const assistantMsg = data.choices[0]?.message;
    if (!assistantMsg) return NextResponse.json({ error: 'OpenRouter 未回傳內容' }, { status: 502 });
    convo.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return NextResponse.json({ text: assistantMsg.content ?? '', queries: queriesUsed });
    }

    for (const call of toolCalls) {
      let query = '';
      try { query = (JSON.parse(call.function.arguments) as { query?: string }).query ?? ''; } catch { /* 參數解析失敗就查空字串，讓下一輪 AI 自行調整 */ }
      queriesUsed.push(query);
      const result = await tavilySearch(query);
      convo.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result });
    }
  }

  return NextResponse.json({ error: '查證輪數過多，請簡化需求後再試一次' }, { status: 500 });
}
