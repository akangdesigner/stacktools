import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { getSettings } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `你是品牌寫文助手的資料整理員。使用者會上傳一份 PDF，可能是品牌簡介、SOP、寫文規範，也可能是主管機關公告的廣告法規、合法宣稱詞句例示表等規範性文件。

你的任務是把文件內容轉成「能直接拿去指導 AI 寫文章」的具體規則，不是把文件原文逐項搬運或分類條列出來。寫出來的東西要讓一個完全沒看過原文件的文案，光看你整理的內容就知道寫文章時該怎麼做、不能怎麼做。

請「只」回傳一個 JSON 物件，不要加任何說明文字或 markdown 標記：
{
  "title": "用 4-10 個字描述這份文件的用途，讓人一看就知道這是哪種文件，例如『品牌簡介』『廣告法規宣稱詞例示表』『寫文 SOP』，不要照抄檔名",
  "brand_description": "品牌服務範圍、目標客群、特色等描述，找不到就回空字串",
  "writing_rules": "給文案撰寫者的具體指示，要讓人看完就知道實際可以怎麼下筆、又要避開什麼，不要只寫空泛的原則。如果文件是法規或合法宣稱詞句範例表，請用『可以寫：...（依產品類別整合出重要、具代表性的具體詞句，不必窮舉每一條，但要保留真正能直接套用的用詞）』加上『但要注意：...（限制、條件、禁止事項，例如不可宣稱醫療效能、哪些詞句需要科學佐證才能使用）』的方式整理，依產品類別分段列出；如果不是法規類文件，就用一般的語氣、結構、用詞限制等具體指示來寫，找不到就回空字串",
  "banned_words": "完全不能使用的具體詞彙或宣稱類型，一行一個，例如『醫療效能』『治療』『治癒』。注意：『需要科學佐證才能使用』的詞句（例如標註*1*2的『美白』『抗菌』『有機』『天然』等）不算禁詞，那是有條件允許，請寫進 writing_rules 的注意事項裡，不要放進這個欄位；這個欄位只放完全不能講的詞，找不到就回空字串"
}
三個欄位的值都必須是「純文字字串」，不可以是 JSON 物件或陣列。`;

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}：\n${toText(val)}`)
      .join('\n\n');
  }
  return String(value);
}

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
      title: toText(parsed.title),
      brand_description: toText(parsed.brand_description),
      writing_rules: toText(parsed.writing_rules),
      banned_words: toText(parsed.banned_words),
    });
  } catch {
    return NextResponse.json({ error: 'AI 回應格式異常，請重試' }, { status: 502 });
  }
}
