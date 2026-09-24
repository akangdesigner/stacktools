import { NextRequest, NextResponse } from 'next/server';
import {
  CLIENT_RULES,
  fetchArticleText,
  type Block,
  parseExtraBanned,
  runComplianceCheck,
  textToBlocks,
} from '@/lib/compliance-check';

// 文案法規檢查 API：貼文章網址或純文字，選客戶規則，回傳每句的禁詞命中＋Jev 風險分數
// 一篇文章百來句約 10 秒，直接同步回傳，不做背景 job

// GET：給前端列出可選的客戶規則（含禁詞，方便畫面上展開看）
export async function GET() {
  return NextResponse.json({
    clients: CLIENT_RULES.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      banned: c.banned,
      required: c.required.map((r) => r.label),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; text?: string; clientId?: string; extraBanned?: string; mode?: 'legal' | 'ai' };
    const ruleSet = CLIENT_RULES.find((c) => c.id === body.clientId) ?? CLIENT_RULES[0];

    let title = '';
    let blocks: Block[];
    if (body.url?.trim()) {
      const url = /^https?:\/\//i.test(body.url.trim()) ? body.url.trim() : 'https://' + body.url.trim();
      const article = await fetchArticleText(url);
      title = article.title;
      blocks = article.blocks;
    } else if (body.text?.trim()) {
      blocks = textToBlocks(body.text);
    } else {
      return NextResponse.json({ error: '請貼文章網址或文字' }, { status: 400 });
    }
    if (blocks.length === 0) return NextResponse.json({ error: '抓不到文章內文' }, { status: 400 });

    const report = await runComplianceCheck({
      mode: body.mode === 'ai' ? 'ai' : 'legal',
      blocks,
      title,
      ruleSet,
      extraBanned: parseExtraBanned(body.extraBanned ?? ''),
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
