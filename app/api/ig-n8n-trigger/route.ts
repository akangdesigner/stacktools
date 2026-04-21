import { NextResponse } from 'next/server';

export async function POST() {
  const url = process.env.N8N_IG_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json({ error: '未設定 N8N_IG_WEBHOOK_URL' }, { status: 500 });
  }
  try {
    const res = await fetch(url, { method: 'POST' });
    const text = await res.text();
    return NextResponse.json({ ok: res.ok, status: res.status, body: text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
