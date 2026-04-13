import { NextRequest, NextResponse } from 'next/server';
import { appendFeedbackRow } from '@/lib/feedback-sheet';

const ALLOWED_CATEGORIES = ['使用問題', '工具建議', '其他'] as const;

function normalizeCategory(raw: string): string {
  const value = raw.trim();
  if (ALLOWED_CATEGORIES.includes(value as (typeof ALLOWED_CATEGORIES)[number])) {
    return value;
  }
  return '其他';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCategory = String(body?.category ?? '');
    const rawContent = String(body?.content ?? '').trim();

    if (!rawContent) {
      return NextResponse.json({ error: '請填寫回饋內容' }, { status: 400 });
    }

    if (rawContent.length > 2000) {
      return NextResponse.json({ error: '回饋內容不可超過 2000 字' }, { status: 400 });
    }

    const category = normalizeCategory(rawCategory);
    await appendFeedbackRow(category, rawContent);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `寫入 Google Sheet 失敗：${String(err)}` },
      { status: 502 }
    );
  }
}
