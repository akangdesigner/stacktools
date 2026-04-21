import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';
import { listClients, listKeywords } from '@/lib/gscDb';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const GSC_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const WINDOW_DAYS = 90;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

async function queryRank(accessToken: string, siteUrl: string, keywords: string[], endDate: string) {
  const bEnd = endDate;
  const bStart = addDays(endDate, -(WINDOW_DAYS - 1));
  const aEnd = addDays(endDate, -7);
  const aStart = addDays(aEnd, -(WINDOW_DAYS - 1));

  async function fetchWindow(start: string, end: string) {
    const res = await fetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 25000 }),
    });
    if (!res.ok) return new Map<string, { position: number; clicks: number; impressions: number }>();
    const data = await res.json() as { rows?: { keys: string[]; position: number; clicks: number; impressions: number }[] };
    const map = new Map<string, { position: number; clicks: number; impressions: number }>();
    for (const row of data.rows ?? []) map.set(row.keys[0], { position: row.position, clicks: row.clicks, impressions: row.impressions });
    return map;
  }

  const [aMap, bMap] = await Promise.all([fetchWindow(aStart, aEnd), fetchWindow(bStart, bEnd)]);

  return keywords.map(kw => ({
    keyword: kw,
    a: aMap.has(kw) ? { found: true, position: Math.round(aMap.get(kw)!.position * 10) / 10 } : { found: false },
    b: bMap.has(kw) ? { found: true, position: Math.round(bMap.get(kw)!.position * 10) / 10, clicks: bMap.get(kw)!.clicks, impressions: bMap.get(kw)!.impressions } : { found: false },
  }));
}

async function writeSheet(accessToken: string, client: { sheet_id: string; sheet_tab: string }, results: ReturnType<typeof queryRank> extends Promise<infer T> ? T : never) {
  const readUrl = `${SHEETS_BASE}/${client.sheet_id}/values/${encodeURIComponent(client.sheet_tab)}`;
  const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!readRes.ok) {
    const errBody = await readRes.json() as { error?: { message?: string } };
    return { updated: 0, error: `read_failed: ${errBody.error?.message ?? readRes.status}` };
  }

  const sheet = await readRes.json() as { values?: string[][] };
  const rows = sheet.values ?? [];
  if (rows.length < 2) return { updated: 0, error: 'no_header' };

  const headerRow = rows[1];
  const kwColIndices: number[] = [];
  headerRow.forEach((cell, i) => { if (cell?.trim() === '關鍵字') kwColIndices.push(i); });
  if (!kwColIndices.length) return { updated: 0, error: 'no_kw_col' };

  type ColMap = { kwCol: number; currentCol: number | null; lastCol: number | null };
  const groups: ColMap[] = kwColIndices.map((kwCol, idx) => {
    const nextKwCol = kwColIndices[idx + 1] ?? headerRow.length;
    let currentCol: number | null = null;
    let lastCol: number | null = null;
    for (let i = kwCol + 1; i < nextKwCol; i++) {
      const h = headerRow[i]?.trim() ?? '';
      if (h === '當周排名' || h === '當前排名') currentCol = i;
      if (h === '上週排名') lastCol = i;
    }
    return { kwCol, currentCol, lastCol };
  });

  const kwMap = new Map<string, { rowIdx: number; group: ColMap }>();
  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    for (const group of groups) {
      const kw = rows[rowIdx][group.kwCol]?.trim();
      if (kw) kwMap.set(kw, { rowIdx, group });
    }
  }

  const updates: { range: string; value: string }[] = [];
  for (const result of results) {
    const match = kwMap.get(result.keyword.trim());
    if (!match) continue;
    const { rowIdx, group } = match;
    const sheetRow = rowIdx + 1;
    if (group.currentCol !== null) {
      updates.push({ range: `${client.sheet_tab}!${colLetter(group.currentCol)}${sheetRow}`, value: result.b.found ? String(Math.floor(result.b.position ?? 0)) : '-' });
    }
    if (group.lastCol !== null) {
      updates.push({ range: `${client.sheet_tab}!${colLetter(group.lastCol)}${sheetRow}`, value: result.a.found ? String(Math.floor(result.a.position ?? 0)) : '-' });
    }
  }

  if (!updates.length) return { updated: 0 };

  const batchRes = await fetch(`${SHEETS_BASE}/${client.sheet_id}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates.map(u => ({ range: u.range, values: [[u.value]] })) }),
  });

  return batchRes.ok ? { updated: updates.length } : { updated: 0, error: 'write_failed' };
}

export async function POST(req: NextRequest) {
  // 簡單驗證 secret，防止任意觸發
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 });
  }

  // endDate = 今天往前兩天
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const endDateStr = endDate.toISOString().slice(0, 10);

  const clients = listClients().filter(c => c.auto_update === 1 && c.sheet_id && c.sheet_tab);
  const results: { name: string; updated: number; error?: string }[] = [];

  for (const client of clients) {
    const keywords = listKeywords(client.id).map(k => k.keyword);
    if (!keywords.length) { results.push({ name: client.name, updated: 0, error: 'no_keywords' }); continue; }

    const rankResults = await queryRank(accessToken, client.site_url, keywords, endDateStr);
    const writeResult = await writeSheet(accessToken, client, rankResults);
    results.push({ name: client.name, ...writeResult });
  }

  return NextResponse.json({ date: endDateStr, results });
}
