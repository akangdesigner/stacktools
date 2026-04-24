export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient } from '@/lib/aiEditorDb';
import { createAiEditorJob, getAiEditorJob, updateAiEditorJob } from '@/lib/ai-editor-jobs';
import { getAccessToken } from '@/lib/gscAuth';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetArticle {
  title: string;
  content: string;
}

async function fetchClientArticles(clientId: number): Promise<SheetArticle[]> {
  const sheetId = process.env.ARTICLE_SHEET_ID;
  const sheetTab = process.env.ARTICLE_SHEET_TAB;
  if (!sheetId || !sheetTab) throw new Error('尚未設定 ARTICLE_SHEET_ID 或 ARTICLE_SHEET_TAB');

  const accessToken = await getAccessToken();
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(sheetTab)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`讀取 Sheet 失敗（HTTP ${res.status}）`);

  const data = await res.json() as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length < 2) return [];

  // 第一列為標題列，找出欄位 index
  const headers = rows[0].map(h => h.trim());
  const idxClientId = headers.indexOf('客戶帳戶ID');
  const idxTitle = headers.indexOf('文章標題');
  const idxContent = headers.indexOf('文章內容');

  if (idxClientId === -1 || idxTitle === -1 || idxContent === -1) {
    throw new Error('Sheet 缺少必要欄位（客戶帳戶ID / 文章標題 / 文章內容）');
  }

  const clientIdStr = String(clientId);
  const matched = rows.slice(1).filter(row => (row[idxClientId] ?? '').trim() === clientIdStr);

  // 取最近 10 篇（Sheet 通常由舊到新，取末尾）
  return matched.slice(-10).map(row => ({
    title: row[idxTitle] ?? '',
    content: (row[idxContent] ?? '').slice(0, 200),
  })).filter(a => a.title);
}

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

  const body = await req.json() as { clientId?: number };
  if (!body.clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getAiEditorClient(body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  if (!client.keywords?.trim()) {
    return NextResponse.json({ error: '請先設定客戶關鍵字' }, { status: 400 });
  }

  let articles: SheetArticle[];
  try {
    articles = await fetchClientArticles(body.clientId);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
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
        purpose: '時事互動貼文',
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
        keywords: client.keywords.trim(),
        articles,
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
    const draftImageUrl = typeof responseObj?.draftImageUrl === 'string' ? responseObj.draftImageUrl : undefined;

    updateAiEditorJob(jobId, 'completed', '時事互動文生成完成', { draftText, draftImageUrl, raw: payload });

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
