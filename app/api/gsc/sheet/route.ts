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

  if (rows.length < 2) {
    return NextResponse.json({ error: 'Sheet 資料不足，找不到標題列' }, { status: 400 });
  }

  // 找標題列（第 2 列，index 1）
  const headerRow = rows[1];

  // 找所有「關鍵字」欄的 index
  const kwColIndices: number[] = [];
  headerRow.forEach((cell, i) => {
    if (cell?.trim() === '關鍵字') kwColIndices.push(i);
  });

  if (kwColIndices.length === 0) {
    return NextResponse.json({ error: '找不到「關鍵字」欄標題' }, { status: 400 });
  }

  // 對每個關鍵字欄，找對應的「當周排名」「上週排名」「當前排名」欄
  // 策略：從關鍵字欄開始，找下一個「關鍵字」欄之前的範圍內尋找排名欄
  type ColMap = { kwCol: number; currentCol: number | null; lastCol: number | null };
  const groups: ColMap[] = kwColIndices.map((kwCol, groupIdx) => {
    const nextKwCol = kwColIndices[groupIdx + 1] ?? headerRow.length;
    let currentCol: number | null = null;
    let lastCol: number | null = null;
    for (let i = kwCol + 1; i < nextKwCol; i++) {
      const h = headerRow[i]?.trim() ?? '';
      if (h === '當周排名' || h === '當前排名') currentCol = i;
      if (h === '上週排名') lastCol = i;
    }
    return { kwCol, currentCol, lastCol };
  });

  // 建立關鍵字 → 列 index 的對應表
  const kwMap = new Map<string, { rowIdx: number; group: ColMap }>();
  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    for (const group of groups) {
      const kw = row[group.kwCol]?.trim();
      if (kw) kwMap.set(kw, { rowIdx, group });
    }
  }

  // 比對 GSC 結果，產生批次更新資料
  const updates: { range: string; value: string }[] = [];
  const notFound: string[] = [];

  for (const result of body.results) {
    const match = kwMap.get(result.keyword.trim());
    if (!match) {
      notFound.push(result.keyword);
      continue;
    }
    const { rowIdx, group } = match;
    const sheetRow = rowIdx + 1; // Sheets API 列號從 1 開始

    if (group.currentCol !== null) {
      updates.push({
        range: `${client.sheet_tab}!${colLetter(group.currentCol)}${sheetRow}`,
        value: result.b.found ? String(Math.floor(result.b.position ?? 0)) : '-',
      });
    }
    if (group.lastCol !== null) {
      updates.push({
        range: `${client.sheet_tab}!${colLetter(group.lastCol)}${sheetRow}`,
        value: result.a.found ? String(Math.floor(result.a.position ?? 0)) : '-',
      });
    }
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
