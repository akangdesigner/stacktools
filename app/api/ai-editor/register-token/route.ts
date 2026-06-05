export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, listAiEditorClients, updateAiEditorClient } from '@/lib/aiEditorDb';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    client_name?: string;
    fb_page_id?: string;
    short_token?: string;
    threads_access_token?: string;
  };

  if (!body.client_name?.trim()) return NextResponse.json({ error: '請輸入客戶名稱' }, { status: 400 });
  if (!body.fb_page_id?.trim()) return NextResponse.json({ error: '請輸入 FB Page ID' }, { status: 400 });
  if (!body.short_token?.trim()) return NextResponse.json({ error: '請輸入 FB 短效 Token' }, { status: 400 });

  const clientName = body.client_name.trim();
  const fbPageId = body.fb_page_id.trim();
  const shortToken = body.short_token.trim();
  const threadsToken = body.threads_access_token?.trim() ?? '';

  try {
    // 1. 用短效 Token 取粉專清單，回傳的 Page Access Token 本身為永久 Token
    const accountsRes = await fetch(
      `https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(shortToken)}`
    );
    const accountsData = await accountsRes.json() as { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message: string } };
    if (!accountsRes.ok || accountsData.error) {
      return NextResponse.json({ error: `查詢粉專失敗：${accountsData.error?.message ?? '未知錯誤'}` }, { status: 400 });
    }
    if (!accountsData.data?.length) {
      return NextResponse.json({ error: '找不到粉專，請確認 Token 有 pages_show_list 權限' }, { status: 400 });
    }
    const page = accountsData.data.find(p => p.id === fbPageId) ?? accountsData.data[0];
    const permanentToken = page.access_token;

    // 2. 找客戶
    const clients = listAiEditorClients();
    const client = clients.find(c => c.name === clientName);
    if (!client) {
      return NextResponse.json({ error: `找不到客戶「${clientName}」，請確認名稱完全一致` }, { status: 404 });
    }

    // 3. 更新
    const updates: Record<string, string> = { fb_page_id: fbPageId, meta_access_token: permanentToken };
    if (threadsToken) updates.threads_access_token = threadsToken;
    updateAiEditorClient(client.id, updates);

    const updated = getAiEditorClient(client.id)!;
    return NextResponse.json({ ok: true, client_name: updated.name, page_name: page.name, fb_page_id: page.id });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
