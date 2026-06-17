import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { getSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `你是品牌資料整理助手。使用者會提供一份 PDF 文件的文字內容（可能是品牌簡介、SOP、寫文規範等）。
請從中整理出三個欄位，並「只」回傳一個 JSON 物件，不要加任何說明文字或 markdown 標記：
{
  "brand_description": "品牌服務範圍、目標客群、特色等描述，找不到就回空字串",
  "writing_rules": "寫文規範與限制，例如語氣、禁止提及的事項、CTA 固定寫法等，找不到就回空字串",
  "banned_words": "禁止使用的詞彙或用語，一行一個，找不到就回空字串"
}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '伺服器尚未設定 OPENROUTER_API_KEY 環境變數' }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result.text;
  } catch {
    return NextResponse.json({ error: 'PDF 解析失敗，請確認檔案是否正常' }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: '無法從 PDF 中讀取到文字內容' }, { status: 400 });
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
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 30000) },
      ],
    }),
  });

  if (!upstream.ok) {
    const raw = await upstream.text();
    let msg: string;
    try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; }
    catch { msg = raw || String(upstream.status); }
    return NextResponse.json({ error: `OpenRouter 錯誤：${msg}` }, { status: upstream.status });
  }

  const data = await upstream.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: 'AI 回應格式異常，請重試' }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      brand_description: parsed.brand_description ?? '',
      writing_rules: parsed.writing_rules ?? '',
      banned_words: parsed.banned_words ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'AI 回應格式異常，請重試' }, { status: 502 });
  }
}
