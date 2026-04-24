export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient } from '@/lib/aiEditorDb';
import { createAiEditorJob, getAiEditorJob, updateAiEditorJob } from '@/lib/ai-editor-jobs';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });

  const job = getAiEditorJob(jobId);
  if (!job) return NextResponse.json({ error: '找不到任務' }, { status: 404 });

  return NextResponse.json(job);
}

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_TRENDING_POST_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: '尚未設定 N8N_TRENDING_POST_WEBHOOK_URL' }, { status: 500 });
  }

  const body = await req.json() as { clientId?: number; topic?: string };
  if (!body.clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getAiEditorClient(body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const jobId = crypto.randomUUID();
  createAiEditorJob(jobId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        purpose: '話題留言製造',
        client: {
          id: client.id,
          name: client.name,
          site_url: client.site_url,
          social_account: client.social_account,
          line_uid: client.line_uid,
          keywords: client.keywords,
          persona: client.persona,
          client_info: client.client_info,
        },
        keywords: client.keywords,
        topic: body.topic?.trim() ?? '',
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const text = await res.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text || null; }

    if (!res.ok) {
      updateAiEditorJob(jobId, 'failed', `n8n 觸發失敗（HTTP ${res.status}）`);
      return NextResponse.json({ error: `n8n webhook 呼叫失敗（HTTP ${res.status}）`, jobId }, { status: 502 });
    }

    const responseObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const draftText = typeof responseObj?.draftText === 'string' ? responseObj.draftText : undefined;

    updateAiEditorJob(jobId, 'completed', '話題留言生成完成', { draftText, raw: payload });

    return NextResponse.json({ ok: true, jobId, status: 'completed' });
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'n8n 請求逾時（20s）'
      : `n8n 觸發失敗：${String(err)}`;
    updateAiEditorJob(jobId, 'failed', msg);
    return NextResponse.json({ error: msg, jobId }, { status: 502 });
  }
}
