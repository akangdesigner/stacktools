import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildSystemPrompt(): string {
  const claudeMd = fs.readFileSync(path.join(process.cwd(), 'CHATBOT.md'), 'utf-8');

  return `你是 Stacktools 工具箱的 AI 小幫手，名字叫「小棧」。
以下是這個工具箱的完整技術與功能說明文件，請根據這份文件回答使用者的問題：

---
${claudeMd}
---

回答規則：
- 全程使用繁體中文
- 面向一般使用者（非開發者），說明要口語化，不要出現程式碼或檔案路徑
- 回答簡潔，1~3 句為主
- 若文件中找不到相關資訊，請說「這個細節我不確定，建議直接試試看或詢問管理員」，不要自行推測
- 問題超出工具箱範疇時，禮貌說明你只負責工具箱相關問題`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '訊息格式錯誤' }, { status: 400 });
    }

    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...messages,
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? '';
    return NextResponse.json({ reply });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '回覆失敗，請稍後再試' }, { status: 500 });
  }
}
