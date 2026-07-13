import { NextRequest, NextResponse } from 'next/server';

// 節慶「AI 改文案」：帶現有標題/內文 + 使用者的修改指示 → 依指示改寫，回傳新的標題/內文。
// 走 OpenRouter（跟生圖同一把 key），純文字改寫、快。
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 改文案模型（可換；Gemini 2.5 Flash 中文好又快）
const REWRITE_MODEL = 'google/gemini-2.5-flash';

// 從模型回應抽出 JSON（容錯：去掉 ```json 圍欄、取第一個大括號區塊）
function extractJson(raw: string): { title?: string; content?: string } | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { title, content, instruction } = (await req.json()) as {
    title?: string;
    content?: string;
    instruction?: string;
  };
  if (!content || !content.trim()) {
    return NextResponse.json({ error: '缺少要修改的貼文內容' }, { status: 400 });
  }
  if (!instruction || !instruction.trim()) {
    return NextResponse.json({ error: '請描述要怎麼改' }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_IMAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' },
      { status: 500 }
    );
  }

  const system = `你是專業的社群小編。使用者會給你一篇現有的社群貼文（標題＋內文）和一個修改指示，請你依指示改寫。

規則：
- 全程使用繁體中文
- 只依「修改指示」調整，其餘保持原貼文的主題、重點與品牌語氣
- 保持適合社群平台的長度與可讀性
- 不要加任何說明或前言
- 只輸出 JSON，格式：{"title": "新標題", "content": "新內文"}`;

  const user = `【現有標題】\n${title || '（無標題）'}\n\n【現有內文】\n${content.trim()}\n\n【修改指示】\n${instruction.trim()}`;

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tool.dg166.com',
        'X-Title': 'Stacktools Festival Rewrite', // header 只能 Latin1，別放中文
      },
      body: JSON.stringify({
        model: REWRITE_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let m: string;
      try {
        m = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw;
      } catch {
        m = raw || String(upstream.status);
      }
      return NextResponse.json({ error: `改文案錯誤：${m}` }, { status: 502 });
    }

    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(text);
    if (!parsed?.content) {
      return NextResponse.json({ error: '改文案回傳格式異常，請重試' }, { status: 502 });
    }

    return NextResponse.json({
      title: parsed.title || title || '',
      content: parsed.content,
    });
  } catch (err) {
    return NextResponse.json({ error: `改文案連線失敗：${String(err)}` }, { status: 504 });
  }
}
