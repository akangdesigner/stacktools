import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 供時事／社群海巡 LIFF 頁列出可選的產業關鍵字（客戶設定的 keywords，逗號分隔）。
// 使用者從中複選最多 3 個，取代 n8n 原本的「隨機挑 2 個」。
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { line_uid } = (await req.json()) as { line_uid?: string };
  if (!line_uid || !line_uid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }
  const client = getClientByLineUid(line_uid.trim());
  if (!client) {
    return NextResponse.json(
      { error: '找不到你的客戶資料，請先在 LINE 完成「客戶資料建立」' },
      { status: 404 }
    );
  }
  const keywords = (client.keywords || '')
    .split(/[,，、\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  return NextResponse.json({ keywords, customerName: client.name });
}
