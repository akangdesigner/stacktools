import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

type Message = { role: string; content: string };

export async function POST(req: NextRequest) {
  // model 可由前端單次指定（Gemini 出稿 / GPT 審稿），未帶則用全域設定
  const { messages, model: bodyModel } = await req.json() as { messages: Message[]; model?: string };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' },
      { status: 500 }
    );
  }

  const settings = getSettings();
  const model = bodyModel?.trim() || settings.openrouter_model || 'openai/gpt-4o-mini';

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools Writer',
    },
    // max_tokens 一定要設，否則 OpenRouter 會用模型上限（Gemini 2.5 Pro 是 65536）預扣額度，
    // 帳戶餘額不夠付這個上限時就算實際用量很少也會直接 402（llms-generator.ts 踩過同樣的坑）
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 8000 }),
  });

  if (!upstream.ok) {
    const raw = await upstream.text();
    let msg: string;
    try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; }
    catch { msg = raw || String(upstream.status); }
    return NextResponse.json({ error: `OpenRouter 錯誤：${msg}` }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
