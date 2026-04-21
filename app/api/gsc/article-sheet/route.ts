import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';
import { listClients } from '@/lib/gscDb';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function colLetter(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    clientId?: number;
    results?: { url: string; position: number | null }[];
  };

  if (!body.clientId || !body.results?.length) {
    return NextResponse.json({ error: '缺少 clientId 或 results' }, { status: 400 });
  }

  const clients = listClients();
  const client = clients.find(c => c.id === body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  if (!client.article_sheet_id || !client.article_sheet_tab) {
    return NextResponse.json({ error: '尚未設定文章 Sheet' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  // 讀取 Sheet
  const readRes = await fetch(
    `${SHEETS_BASE}/${client.article_sheet_id}/values/${encodeURIComponent(client.article_sheet_tab)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!readRes.ok) {
    const err = await readRes.json() as { error?: { message: string } };
    return NextResponse.json({ error: `讀取 Sheet 失敗：${err.error?.message ?? readRes.status}` }, { status: 502 });
  }

  const sheet = await readRes.json() as { values?: string[][] };
  const rows = sheet.values ?? [];
  if (rows.length < 1) return NextResponse.json({ error: 'Sheet 無資料' }, { status: 400 });

  // 找標題列（第 1 列 index 0）中的「原文章連結」和「排名」欄
  const headerRow = rows[0];
  const urlCol = headerRow.findIndex(h => h?.trim() === '原文章連結');
  const rankCol = headerRow.findIndex(h => h?.trim() === '排名');

  if (urlCol === -1) return NextResponse.json({ error: '找不到「原文章連結」欄' }, { status: 400 });
  if (rankCol === -1) return NextResponse.json({ error: '找不到「排名」欄' }, { status: 400 });

  function normalizeUrl(url: string) {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }

  // 建立 URL → 列號對應
  const urlMap = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const url = rows[i][urlCol]?.trim();
    if (url) urlMap.set(normalizeUrl(url), i);
  }

  // 產生批次更新
  const updates: { range: string; value: string }[] = [];
  const notFound: string[] = [];

  for (const result of body.results) {
    const rowIdx = urlMap.get(normalizeUrl(result.url));
    if (rowIdx === undefined) { notFound.push(result.url); continue; }
    const sheetRow = rowIdx + 1;
    updates.push({
      range: `${client.article_sheet_tab}!${colLetter(rankCol)}${sheetRow}`,
      value: result.position !== null ? String(result.position) : '-',
    });
  }

  if (!updates.length) return NextResponse.json({ updated: 0, notFound });

  const batchRes = await fetch(`${SHEETS_BASE}/${client.article_sheet_id}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map(u => ({ range: u.range, values: [[u.value]] })),
    }),
  });

  if (!batchRes.ok) {
    const err = await batchRes.json() as { error?: { message: string } };
    return NextResponse.json({ error: `寫入 Sheet 失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
  }

  return NextResponse.json({ updated: updates.length, notFound });
}
