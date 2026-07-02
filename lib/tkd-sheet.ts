import { getAccessToken } from './gscAuth';

// 共用 GSC 那套 OAuth（已含 spreadsheets 寫入權限）來讀寫登記表
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// 從網址或純 ID 取出試算表 ID
export function extractSheetId(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : urlOrId.trim();
}

// 從網址取出 gid（分頁編號），例如 ...#gid=1881353642
export function extractGid(url: string): number | null {
  const m = url.match(/[#?&]gid=(\d+)/);
  return m ? Number(m[1]) : null;
}

// 依 gid 找出分頁名稱；沒有 gid 時回傳第一個分頁
export async function resolveTabName(sheetId: string, gid: number | null): Promise<string> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `無法讀取試算表資訊（${res.status}）`);
  }
  const data = (await res.json()) as {
    sheets: { properties: { title: string; sheetId: number } }[];
  };
  const sheets = data.sheets ?? [];
  if (sheets.length === 0) throw new Error('試算表沒有分頁');
  if (gid != null) {
    const hit = sheets.find((s) => s.properties.sheetId === gid);
    if (hit) return hit.properties.title;
  }
  return sheets[0].properties.title;
}

// 讀取分頁表頭：略過全空白列與只有單一欄位的「說明列」，取第一個多欄列當表頭
export async function readHeaders(sheetId: string, tabName: string): Promise<string[]> {
  const accessToken = await getAccessToken();
  const url = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `無法讀取 Sheet（${res.status}）`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  let headerIdx = 0;
  while (
    headerIdx < values.length &&
    values[headerIdx].filter((cell) => cell?.trim()).length < 2
  ) {
    headerIdx++;
  }
  return values[headerIdx] ?? [];
}

// 一次把多列 append 到分頁最後（比逐列寫入省很多次 API 呼叫）
export async function appendRows(
  sheetId: string,
  tabName: string,
  rows: string[][],
): Promise<void> {
  if (rows.length === 0) return;
  const accessToken = await getAccessToken();
  const range = `${tabName}!A:A`;
  const url =
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `寫入失敗（${res.status}）`);
  }
}

// 清掉登記表中「頁面欄屬於指定網站」的舊列，避免同一客戶重跑時資料重複疊加
// 回傳刪除的列數；idxPage 為頁面欄索引，host 例如 'stack.com.tw'
export async function clearRowsOfSite(
  sheetId: string,
  tabName: string,
  idxPage: number,
  host: string,
): Promise<number> {
  if (!host || idxPage < 0) return 0;
  const accessToken = await getAccessToken();

  // 取得分頁的數字 gid（deleteDimension 需要）
  const metaRes = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = (await metaRes.json()) as { sheets: { properties: { title: string; sheetId: number } }[] };
  const gid = meta.sheets?.find((s) => s.properties.title === tabName)?.properties.sheetId;
  if (gid === undefined) throw new Error(`找不到分頁：${tabName}`);

  // 讀現有值（FORMULA 才看得到 HYPERLINK 公式裡的網址）
  const res = await fetch(
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tabName)}?valueRenderOption=FORMULA`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return 0;
  const values = ((await res.json()) as { values?: string[][] }).values ?? [];

  // 略過說明列找到表頭列，資料列從其下一列開始
  let hi = 0;
  while (hi < values.length && values[hi].filter((c) => c && String(c).trim()).length < 2) hi++;
  const dataRows = values.slice(hi + 1);

  // 找出頁面欄含此網站網址的列（0-based sheet 列號）
  const toDelete: number[] = [];
  dataRows.forEach((r, i) => {
    const cell = String(r[idxPage] ?? '');
    if (cell.includes(host)) toDelete.push(hi + 1 + i);
  });
  if (toDelete.length === 0) return 0;

  // 由後往前刪，避免刪除造成的列號位移
  toDelete.sort((a, b) => b - a);
  const requests = toDelete.map((idx) => ({
    deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } },
  }));
  const del = await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!del.ok) {
    const err = (await del.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `清除舊列失敗（${del.status}）`);
  }
  return toDelete.length;
}

// 欄位索引轉欄名（0→A、1→B…）
export function colLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// 讀分頁全部值（FORMULA 才看得到 HYPERLINK 裡的網址）；回傳表頭、資料列、資料起始列號
export async function readValues(
  sheetId: string,
  tabName: string,
): Promise<{ headers: string[]; rows: string[][]; rowOffset: number }> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tabName)}?valueRenderOption=FORMULA`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `讀取失敗（${res.status}）`);
  }
  const values = ((await res.json()) as { values?: string[][] }).values ?? [];
  let hi = 0;
  while (hi < values.length && values[hi].filter((c) => c && String(c).trim()).length < 2) hi++;
  return { headers: values[hi] ?? [], rows: values.slice(hi + 1), rowOffset: hi + 2 };
}

// 一次寫入多個不連續儲存格（每筆 { range: 'tab!C5', values: [['x']] }）
export async function batchUpdateValues(
  sheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<void> {
  if (data.length === 0) return;
  const accessToken = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `批次寫入失敗（${res.status}）`);
  }
}
