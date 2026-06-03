import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';
import { listClients } from '@/lib/gscDb';

export const dynamic = 'force-dynamic';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function GET(req: NextRequest) {
  const clientId = Number(req.nextUrl.searchParams.get('clientId'));
  if (!clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const clients = listClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  if (!client.article_sheet_id) {
    return NextResponse.json({ error: '此客戶尚未設定文章 Sheet，請至 GSC 客戶設定頁面填入。' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  const range = client.article_sheet_tab ? encodeURIComponent(client.article_sheet_tab) : '';
  const url = range
    ? `${SHEETS_BASE}/${client.article_sheet_id}/values/${range}`
    : `${SHEETS_BASE}/${client.article_sheet_id}/values/A1:ZZZ`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    return NextResponse.json({ error: `讀取 Sheet 失敗：${err.error?.message ?? res.status}` }, { status: 502 });
  }

  const sheet = await res.json() as { values?: string[][] };
  const allRows = sheet.values ?? [];
  if (allRows.length === 0) {
    return NextResponse.json({ headers: [], rows: [], tabName: client.article_sheet_tab, rowOffset: 2 });
  }

  const headers = allRows[0];
  const rows = allRows.slice(1);
  return NextResponse.json({ headers, rows, tabName: client.article_sheet_tab, rowOffset: 2 });
}

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
    results?: { title: string; position: number | null }[];
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

  const headerRow = rows[0];
  const norm = (s: string) => (s ?? '').normalize('NFKC').trim().toLowerCase();
  const titleCol = headerRow.findIndex(h => norm(h ?? '') === norm('文章標題'));
  const rankCol = headerRow.findIndex(h => norm(h ?? '') === norm('排名'));

  if (titleCol === -1) return NextResponse.json({ error: '找不到「文章標題」欄' }, { status: 400 });
  if (rankCol === -1) return NextResponse.json({ error: '找不到「排名」欄' }, { status: 400 });


  const loose = (s: string) => norm(s).replace(/\s+/g, '');

  const titleMap = new Map<string, number[]>();
  const titleMapLoose = new Map<string, number[]>();
  for (let i = 1; i < rows.length; i++) {
    const t = rows[i][titleCol]?.trim();
    if (t) {
      const key = norm(t);
      const arr = titleMap.get(key) ?? [];
      arr.push(i);
      titleMap.set(key, arr);

      const lkey = loose(t);
      const larr = titleMapLoose.get(lkey) ?? [];
      larr.push(i);
      titleMapLoose.set(lkey, larr);
    }
  }

  const updates: { range: string; value: string }[] = [];
  const notFound: string[] = [];

  for (const result of body.results) {
    const rowIndices = titleMap.get(norm(result.title)) ?? titleMapLoose.get(loose(result.title));
    if (!rowIndices?.length) { notFound.push(result.title); continue; }
    for (const rowIdx of rowIndices) {
      updates.push({
        range: `${client.article_sheet_tab}!${colLetter(rankCol)}${rowIdx + 1}`,
        value: result.position !== null ? String(result.position) : '-',
      });
    }
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
