export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = process.env.N8N_TOKEN_REGISTER_WEBHOOK_URL ?? 'https://stack.zeabur.app/webhook/token-register';

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

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: body.client_name.trim(),
        fb_page_id: body.fb_page_id.trim(),
        short_token: body.short_token.trim(),
        threads_access_token: body.threads_access_token?.trim() ?? '',
      }),
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }

    if (!res.ok) {
      return NextResponse.json({ error: `n8n 處理失敗（HTTP ${res.status}）`, detail: data }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
