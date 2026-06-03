import { getAccessToken } from './gscAuth';
import { getSettings } from './writerDb';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export type SheetData = {
  headers: string[];
  rows: string[][];
  tabName: string;
  rowOffset: number; // data.rows[i] 對應的 Sheet 列號 = i + rowOffset（1-indexed）
};

function extractSheetId(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : urlOrId.trim();
}

function colLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function getFirstTabName(sheetId: string, accessToken: string): Promise<string> {
  const res = await fetch(
    `${SHEETS_BASE}/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`無法讀取試算表資訊（${res.status}）`);
  const data = await res.json() as { sheets: { properties: { title: string } }[] };
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error('試算表沒有分頁');
  return title;
}

async function readSheet(sheetId: string, tabName?: string, skipRows = 0): Promise<SheetData> {
  const accessToken = await getAccessToken();
  const tab = tabName || await getFirstTabName(sheetId, accessToken);
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tab)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `無法讀取 Sheet（${res.status}）`);
  }

  const data = await res.json() as { values?: string[][] };
  const values = data.values ?? [];
  // 跳過全空白列，再額外跳過 skipRows 列，然後取表頭
  let headerIdx = 0;
  while (headerIdx < values.length && values[headerIdx].every(cell => !cell?.trim())) {
    headerIdx++;
  }
  headerIdx += skipRows;
  const headers = values[headerIdx] ?? [];
  const rows = values.slice(headerIdx + 1);
  const rowOffset = headerIdx + 2;
  return { headers, rows, tabName: tab, rowOffset };
}

export function getSchedule(): Promise<SheetData> {
  const s = getSettings();
  if (!s.schedule_sheet_id) throw new Error('尚未設定每日排程 Sheet，請至設定頁填入網址');
  return readSheet(extractSheetId(s.schedule_sheet_id), s.schedule_sheet_tab || undefined);
}

export function getClients(): Promise<SheetData> {
  const s = getSettings();
  if (!s.clients_sheet_id) throw new Error('尚未設定客戶帳密 Sheet，請至設定頁填入網址');
  return readSheet(extractSheetId(s.clients_sheet_id), s.clients_sheet_tab || undefined);
}

export function getProgressBySheetId(sheetId: string, tabName?: string, skipRows = 0): Promise<SheetData> {
  return readSheet(extractSheetId(sheetId), tabName, skipRows);
}

export async function deleteRow(sheetId: string, tabName: string, sheetRow: number): Promise<void> {
  const accessToken = await getAccessToken();
  // 取得分頁的數字 gid
  const metaRes = await fetch(
    `${SHEETS_BASE}/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json() as { sheets: { properties: { title: string; sheetId: number } }[] };
  const tabGid = meta.sheets.find(s => s.properties.title === tabName)?.properties?.sheetId;
  if (tabGid === undefined) throw new Error(`找不到分頁：${tabName}`);

  const startIndex = sheetRow - 1; // Sheets API 用 0-based
  const res = await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId: tabGid, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 } } }]
    }),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `刪除失敗（${res.status}）`);
  }
}

export async function insertRow(sheetId: string, tabName: string, sheetRow: number, initialValues: string[]): Promise<void> {
  const accessToken = await getAccessToken();
  // 取得分頁 gid
  const metaRes = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const meta = await metaRes.json() as { sheets: { properties: { title: string; sheetId: number } }[] };
  const tabGid = meta.sheets.find(s => s.properties.title === tabName)?.properties?.sheetId;
  if (tabGid === undefined) throw new Error(`找不到分頁：${tabName}`);

  const startIndex = sheetRow - 1;
  // Step 1: 插入空列
  const insertRes = await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertDimension: { range: { sheetId: tabGid, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 }, inheritFromBefore: false } }] }),
  });
  if (!insertRes.ok) {
    const err = await insertRes.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `插入失敗（${insertRes.status}）`);
  }
  // Step 2: 寫入初始值
  if (initialValues.some(v => v)) {
    const range = `${tabName}!A${sheetRow}`;
    await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [initialValues] }),
    });
  }
}

export async function appendRow(sheetId: string, tabName: string, initialValues: string[]): Promise<void> {
  const accessToken = await getAccessToken();
  const range = `${tabName}!A:A`;
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [initialValues] }),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `新增失敗（${res.status}）`);
  }
}

export async function updateCell(sheetId: string, tabName: string, sheetRow: number, colIdx: number, value: string): Promise<void> {
  const accessToken = await getAccessToken();
  const col = colLetter(colIdx);
  const range = `${tabName}!${col}${sheetRow}`;
  const res = await fetch(
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[value]] }),
    }
  );
  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `寫入失敗（${res.status}）`);
  }
}

export async function updateScheduleCell(rowIdx: number, colIdx: number, value: string): Promise<void> {
  const s = getSettings();
  if (!s.schedule_sheet_id) throw new Error('尚未設定排程 Sheet');

  const sheetId = extractSheetId(s.schedule_sheet_id);
  const accessToken = await getAccessToken();

  // 取得 tab 名稱
  const tab = s.schedule_sheet_tab || await getFirstTabName(sheetId, accessToken);

  // 先讀取 rowOffset
  const { rowOffset } = await readSheet(sheetId, tab);
  const sheetRow = rowIdx + rowOffset;
  const col = colLetter(colIdx);
  const range = `${tab}!${col}${sheetRow}`;

  const res = await fetch(
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[value]] }),
    }
  );

  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    throw new Error(err.error?.message ?? `寫入失敗（${res.status}）`);
  }
}
