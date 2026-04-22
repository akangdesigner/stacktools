import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';
import { listClients, listKeywords } from '@/lib/gscDb';

interface SingleResult {
  found: boolean;
  position?: number;
}

interface KwResult {
  keyword: string;
  a: SingleResult;
  b: SingleResult;
}

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
    results?: KwResult[];
  };

  if (!body.clientId || !body.results?.length) {
    return NextResponse.json({ error: '缺少 clientId 或 results' }, { status: 400 });
  }

  const clients = listClients();
  const client = clients.find(c => c.id === body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  if (!client.sheet_id || !client.sheet_tab) {
    return NextResponse.json({ error: '此客戶尚未設定 Sheet ID 或分頁名稱' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  // 讀取整個分頁
  const readUrl = `${SHEETS_BASE}/${client.sheet_id}/values/${encodeURIComponent(client.sheet_tab)}`;
  const readRes = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!readRes.ok) {
    const err = await readRes.json() as { error?: { message: string } };
    return NextResponse.json({ error: `讀取 Sheet 失敗：${err.error?.message ?? readRes.status}` }, { status: 502 });
  }

  const sheet = await readRes.json() as { values?: string[][] };
  const rows = sheet.values ?? [];

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Sheet 無資料' }, { status: 400 });
  }

  const norm = (s: string) => s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');

  // 掃描全表，建立 關鍵字 → { rowIdx, colIdx } 對應表
  // 找到關鍵字後，右邊+1 格寫上週排名，+2 格寫當周排名（相對定位）
  const kwMap = new Map<string, { rowIdx: number; colIdx: number }>();
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx];
      if (cell?.trim()) kwMap.set(norm(cell), { rowIdx, colIdx });
    }
  }

  // 比對 GSC 結果，產生批次更新資料
  const updates: { range: string; value: string }[] = [];
  const notFound: string[] = [];

  for (const result of body.results) {
    const match = kwMap.get(norm(result.keyword));
    if (!match) {
      notFound.push(result.keyword);
      continue;
    }
    const { rowIdx, colIdx } = match;
    const sheetRow = rowIdx + 1; // Sheets API 列號從 1 開始

    // 上週排名（a）寫在關鍵字右邊一格，當周排名（b）寫右邊兩格
    updates.push({
      range: `${client.sheet_tab}!${colLetter(colIdx + 1)}${sheetRow}`,
      value: result.a.found ? String(Math.floor(result.a.position ?? 0)) : '-',
    });
    updates.push({
      range: `${client.sheet_tab}!${colLetter(colIdx + 2)}${sheetRow}`,
      value: result.b.found ? String(Math.floor(result.b.position ?? 0)) : '-',
    });
  }

  if (updates.length === 0) {
    return NextResponse.json({ updated: 0, notFound });
  }

  // 批次寫入
  const batchUrl = `${SHEETS_BASE}/${client.sheet_id}/values:batchUpdate`;
  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map(u => ({
        range: u.range,
        values: [[u.value]],
      })),
    }),
  });

  if (!batchRes.ok) {
    const err = await batchRes.json() as { error?: { message: string } };
    return NextResponse.json({ error: `寫入 Sheet 失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
  }

  return NextResponse.json({ updated: updates.length, notFound });
}
