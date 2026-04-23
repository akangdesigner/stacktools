export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient } from '@/lib/aiEditorDb';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  const body = await req.json() as { clientId?: number; holiday?: string };
  if (!body.clientId || !body.holiday) {
    return NextResponse.json({ error: '缺少 clientId 或 holiday' }, { status: 400 });
  }

  const client = getAiEditorClient(body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '尚未設定 GROQ_API_KEY' }, { status: 500 });

  const kwList = (client.keywords ?? '')
    .split(/[\n,，、]+/)
    .map((k: string) => k.trim())
    .filter(Boolean);

  if (!kwList.length) {
    return NextResponse.json({ error: '請先設定客戶關鍵字' }, { status: 400 });
  }

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: `你是社群媒體文案專家，擅長繁體中文貼文。
客戶產業關鍵字清單：${kwList.join('、')}
即將到來的節慶：${body.holiday}
請產出 4 個吸睛的繁體中文貼文標題，每個標題只從清單中自然地挑選 1-2 個最合適的關鍵字融入，不要硬塞所有關鍵字。
每個標題獨立一行，只輸出標題本身，不加編號、符號或任何說明。`,
      },
    ],
    temperature: 0.8,
    max_tokens: 512,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const titles = raw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);

  return NextResponse.json({ titles });
}
