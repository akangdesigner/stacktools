import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';

// 把網站技術健檢結果寫回進度表：比對「確認事項」欄找到對應列，只更新「狀態」欄。
// 帳號共用 GSC 那組 OAuth（SEO 信箱），其 scope 已含 spreadsheets 讀寫。
export const maxDuration = 60;

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// 狀態代碼 → 表上中文用語
const STATUS_TEXT: Record<string, string> = { ok: '正常', warn: '可優化', fail: '需處理' };

// 從進度表網址解析 spreadsheetId
function extractSheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // 也允許直接貼純 ID
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

// 從網址解析分頁 gid（#gid= / ?gid= / &gid=）
function extractGid(input: string): number | null {
  const m = input.match(/[?#&]gid=(\d+)/);
  return m ? Number(m[1]) : null;
}

// 用 gid 查出分頁名稱（讀 spreadsheet metadata）
async function resolveTabByGid(sheetId: string, gid: number, accessToken: string): Promise<string | null> {
  const url = `${SHEETS_BASE}/${sheetId}?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const hit = data.sheets?.find((s) => s.properties?.sheetId === gid);
  return hit?.properties?.title ?? null;
}

// 欄 index → A1 欄名（0→A、26→AA）
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
  const body = (await req.json()) as {
    sheetUrl?: string;
    tab?: string;
    checks?: { level: string; category: string; item: string; status: string; advice: string }[];
  };

  const sheetId = body.sheetUrl ? extractSheetId(body.sheetUrl) : null;
  if (!sheetId) return NextResponse.json({ error: '進度表網址不正確，請貼 Google Sheet 連結' }, { status: 400 });
  if (!body.checks?.length) return NextResponse.json({ error: '沒有可寫入的健檢結果' }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  // 決定要寫入的分頁：優先用手填的名稱；沒填就用網址的 gid 自動辨識
  let tab = body.tab?.trim() ?? '';
  if (!tab) {
    const gid = body.sheetUrl ? extractGid(body.sheetUrl) : null;
    if (gid !== null) {
      const resolved = await resolveTabByGid(sheetId, gid, accessToken);
      if (resolved) tab = resolved;
    }
  }
  if (!tab) {
    return NextResponse.json({ error: '無法判斷分頁：請貼含 gid 的網址，或手動填分頁名稱' }, { status: 400 });
  }

  // 讀整個分頁
  const readUrl = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tab)}`;
  const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!readRes.ok) {
    const err = (await readRes.json()) as { error?: { message: string } };
    return NextResponse.json({ error: `讀取進度表失敗：${err.error?.message ?? readRes.status}` }, { status: 502 });
  }
  const rows = ((await readRes.json()) as { values?: string[][] }).values ?? [];

  // 找標題列：含「確認事項」儲存格的那一列
  let headerRowIdx = -1;
  let itemCol = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const idx = rows[i].findIndex((c) => c?.trim() === '確認事項');
    if (idx !== -1) {
      headerRowIdx = i;
      itemCol = idx;
      break;
    }
  }
  if (headerRowIdx === -1) {
    return NextResponse.json({ error: '在分頁前 10 列找不到「確認事項」標題，請確認分頁名稱是否正確' }, { status: 400 });
  }

  // 狀態欄：優先找標題「狀態」，找不到就用確認事項左邊一欄（表結構為 分類 | 狀態 | 確認事項）
  const header = rows[headerRowIdx];
  let statusCol = header.findIndex((c) => c?.trim() === '狀態');
  if (statusCol === -1) statusCol = itemCol - 1;
  if (statusCol < 0) {
    return NextResponse.json({ error: '找不到「狀態」欄，請確認表格欄位順序' }, { status: 400 });
  }

  // 補列時要用到的其他欄位定位（找不到＝-1，補列時跳過該欄）
  const levelCol = header.findIndex((c) => c?.trim() === '影響層級');
  const categoryCol = header.findIndex((c) => c?.trim() === '分類');
  const adviceCol = header.findIndex((c) => c?.trim() === 'SEO 建議事項');

  // 建「確認事項文字 → 列號」對應表（資料列從標題列的下一列開始）
  const itemToRow = new Map<string, number>();
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const name = rows[r][itemCol]?.trim();
    if (name) itemToRow.set(name, r);
  }

  // 逐項比對：找到→更新狀態欄；找不到→組一整列，稍後補到分頁尾端
  const updates: { range: string; value: string }[] = [];
  const appendRows: string[][] = [];
  const appendedItems: string[] = [];
  const maxCol = Math.max(levelCol, categoryCol, statusCol, itemCol, adviceCol);
  for (const check of body.checks) {
    const text = STATUS_TEXT[check.status] ?? check.status;
    const rowIdx = itemToRow.get(check.item.trim());
    if (rowIdx !== undefined) {
      updates.push({ range: `${tab}!${colLetter(statusCol)}${rowIdx + 1}`, value: text });
      continue;
    }
    // 補列：依標題欄位定位把值放到對的欄，其餘留空（客戶回覆/積木回覆保持空白）
    const row = Array(maxCol + 1).fill('');
    if (levelCol !== -1) row[levelCol] = check.level;
    if (categoryCol !== -1) row[categoryCol] = check.category;
    row[statusCol] = text;
    row[itemCol] = check.item;
    if (adviceCol !== -1) row[adviceCol] = check.advice;
    appendRows.push(row);
    appendedItems.push(check.item);
  }

  // 更新既有列的狀態欄
  if (updates.length > 0) {
    const batchRes = await fetch(`${SHEETS_BASE}/${sheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates.map((u) => ({ range: u.range, values: [[u.value]] })),
      }),
    });
    if (!batchRes.ok) {
      const err = (await batchRes.json()) as { error?: { message: string } };
      return NextResponse.json({ error: `更新狀態欄失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
    }
  }

  // 補列：把找不到對應列的項目 append 到分頁尾端
  if (appendRows.length > 0) {
    const appendUrl = `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tab)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: appendRows }),
    });
    if (!appendRes.ok) {
      const err = (await appendRes.json()) as { error?: { message: string } };
      return NextResponse.json({ error: `補列失敗：${err.error?.message ?? appendRes.status}` }, { status: 502 });
    }
  }

  return NextResponse.json({ updated: updates.length, appended: appendRows.length, appendedItems });
}
