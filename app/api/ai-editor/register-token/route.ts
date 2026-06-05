export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, listAiEditorClients, updateAiEditorClient } from '@/lib/aiEditorDb';

const META_APP_ID = process.env.META_APP_ID ?? '1330302759039656';
const META_APP_SECRET = process.env.META_APP_SECRET ?? '422a0b10d4242d819c0720013f3e5080';

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
    // 1. 換長效 User Token（60 天）
    const exchangeRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`
    );
    const exchangeData = await exchangeRes.json() as { access_token?: string; error?: { message: string } };
    if (!exchangeRes.ok || !exchangeData.access_token) {
      return NextResponse.json({ error: `Token 交換失敗：${exchangeData.error?.message ?? '未知錯誤'}` }, { status: 400 });
    }
    const longLivedToken = exchangeData.access_token;

    // 2. 取粉專清單，找永久 Page Token
    const accountsRes = await fetch(
      `https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(longLivedToken)}`
    );
    const accountsData = await accountsRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> };
    if (!accountsRes.ok || !accountsData.data?.length) {
      return NextResponse.json({ error: '找不到粉專，請確認 Token 有 pages_show_list 權限' }, { status: 400 });
    }
    const page = accountsData.data.find(p => p.id === fbPageId) ?? accountsData.data[0];
    const permanentToken = page.access_token;

    // 3. 找客戶
    const clients = listAiEditorClients();
    const client = clients.find(c => c.name === clientName);
    if (!client) {
      return NextResponse.json({ error: `找不到客戶「${clientName}」，請確認名稱完全一致` }, { status: 404 });
    }

    // 4. 更新
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
