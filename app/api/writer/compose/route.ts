import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

type Message = { role: string; content: string };

export async function POST(req: NextRequest) {
  const { messages } = await req.json() as { messages: Message[] };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' },
      { status: 500 }
    );
  }

  const settings = getSettings();
  const model = settings.openrouter_model || 'openai/gpt-4o-mini';

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools Writer',
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
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
