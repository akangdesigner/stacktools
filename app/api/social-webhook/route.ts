import { NextRequest, NextResponse } from 'next/server';
import { getClient, getClientUrls, createJob } from '@/lib/socialDb';

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_SOCIAL_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: '未設定 N8N_SOCIAL_WEBHOOK_URL' }, { status: 500 });
  }

  let body: { clientId?: string; dateFrom?: string; dateTo?: string; slackChannelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { clientId, dateFrom, dateTo, slackChannelId: bodySlackId } = body;
  if (!clientId?.trim()) {
    return NextResponse.json({ error: '請提供客戶 ID' }, { status: 400 });
  }

  const client = getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  }

  const platforms = getClientUrls(clientId);
  const job = createJob(clientId, dateFrom, dateTo);
  const callbackUrl = `${req.nextUrl.origin}/api/social-webhook/callback`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: job.id,
        callbackUrl,
        clientName: client.name,
        slackChannelId: bodySlackId ?? client.slack_id ?? '',
        platforms,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `N8N 回應錯誤（${res.status}）：${text}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, jobId: job.id, status: 'processing' });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'N8N 請求逾時（15s），請確認 Webhook URL 與 workflow 狀態'
      : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
