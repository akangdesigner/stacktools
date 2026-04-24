export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient } from '@/lib/aiEditorDb';
import { createAiEditorJob, getAiEditorJob, updateAiEditorJob } from '@/lib/ai-editor-jobs';

function toRssUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  if (!trimmed) return '';

  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    return '';
  }

  const pathname = urlObj.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/feed')) {
    return urlObj.toString();
  }

  urlObj.pathname = `${pathname}/feed/`;
  return urlObj.toString();
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
  }

  const job = getAiEditorJob(jobId);
  if (!job) {
    return NextResponse.json({ error: '找不到任務' }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_TRENDING_POST_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: '尚未設定 N8N_TRENDING_POST_WEBHOOK_URL' }, { status: 500 });
  }

  const body = await req.json() as { clientId?: number };
  if (!body.clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getAiEditorClient(body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const rssUrl = toRssUrl(client.site_url);
  if (!rssUrl) {
    return NextResponse.json({ error: '官網網址格式不正確，無法轉為 RSS feed URL' }, { status: 400 });
  }

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
        purpose: '新文章草稿',
        client: {
          id: client.id,
          name: client.name,
          site_url: client.site_url,
          social_account: client.social_account,
          line_uid: client.line_uid,
          keywords: client.keywords,
          persona: client.persona,
        },
        siteUrl: client.site_url,
        rssUrl,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text || null;
    }

    if (!res.ok) {
      updateAiEditorJob(jobId, 'failed', `n8n 觸發失敗（HTTP ${res.status}）`);
      return NextResponse.json(
        { error: `n8n webhook 呼叫失敗（HTTP ${res.status}）`, jobId },
        { status: 502 }
      );
    }

    const responseObj = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;

    const draftText = typeof responseObj?.draftText === 'string' ? responseObj.draftText : undefined;
    const draftImageUrl = typeof responseObj?.draftImageUrl === 'string' ? responseObj.draftImageUrl : undefined;

    updateAiEditorJob(jobId, 'completed', '草稿生成完成', {
      draftText,
      draftImageUrl,
      raw: payload,
    });

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
