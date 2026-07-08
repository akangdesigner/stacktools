import { NextRequest, NextResponse } from 'next/server';

// 節慶生圖：LIFF 網頁按「生成圖片」時呼叫，直接打 OpenRouter gpt-5.4-image-2
// （跟 n8n 原本的生圖節點同模型、同回傳格式；差別只是搬到網頁端、沒有 LINE 60 秒限制）
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // gpt-5.4-image-2 約 200 秒，放寬到 300 秒

export async function POST(req: NextRequest) {
  const { imagePrompt, adjustment } = (await req.json()) as {
    imagePrompt?: string;
    adjustment?: string; // 使用者的定向改圖需求（中文，如「把背景換成海邊」）
  };
  if (!imagePrompt || !imagePrompt.trim()) {
    return NextResponse.json({ error: '缺少 imagePrompt' }, { status: 400 });
  }

  // 有定向修改需求就把它接在原提示詞後面，強調務必套用（gpt-5.4-image-2 中文 OK）
  const finalPrompt = adjustment?.trim()
    ? `${imagePrompt}\n\n[Adjustment — must apply exactly, this overrides conflicting parts above]: ${adjustment.trim()}`
    : imagePrompt;

  // 生圖優先用專用 key（跟 n8n 生圖同一把帳號），沒設就退回一般 OpenRouter key
  const apiKey = process.env.OPENROUTER_IMAGE_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 OPENROUTER_IMAGE_API_KEY 或 OPENROUTER_API_KEY 環境變數' },
      { status: 500 }
    );
  }

  // 生圖慢，給 285 秒的中止保護，避免無限掛住
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tool.dg166.com',
        'X-Title': 'Stacktools 節慶生圖',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.4-image-2',
        messages: [{ role: 'user', content: [{ type: 'text', text: finalPrompt }] }],
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let msg: string;
      try {
        msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw;
      } catch {
        msg = raw || String(upstream.status);
      }
      return NextResponse.json({ error: `OpenRouter 生圖錯誤：${msg}` }, { status: 502 });
    }

    const data = (await upstream.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };

    // 回傳格式跟 n8n Edit Fields3 讀的路徑一致：choices[0].message.images[0].image_url.url = data URL
    const dataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) {
      return NextResponse.json(
        { error: '生圖回傳沒有圖片（模型可能抽風，請重試）' },
        { status: 502 }
      );
    }

    return NextResponse.json({ dataUrl });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? '生圖逾時（超過 285 秒），請重試' : `生圖失敗：${String(err)}` },
      { status: 504 }
    );
  } finally {
    clearTimeout(timer);
  }
}
