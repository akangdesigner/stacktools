import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';

// 把網站技術健檢結果寫回進度表——比照 n8n「只填值、不碰格式」：
//  - 確認事項對到既有列 → 只更新該列「狀態」欄的值（保留原本的晶片下拉樣式）
//  - 找不到對應列 → 填進表格「預留的空白列」（那些已設好晶片格式的列），只填值，
//    值自動繼承格子既有的下拉晶片樣式；預留列不足時才在尾端 append 純值列
//  - 補的區塊前加一列「日期：」分隔列
// 工具完全不設 dataValidation / 顯示樣式（API 無法設定晶片顯示樣式，須由表格本身預先設好）。
export const maxDuration = 60;

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const STATUS_TEXT: Record<string, string> = { ok: '正常', warn: '可優化', fail: '需處理' };
const rgb = (red: number, green: number, blue: number) => ({ red, green, blue });
const DATE_COLOR = rgb(0.99, 0.87, 0.76); // 日期分隔列橘底

// 從進度表網址解析 spreadsheetId
function extractSheetId(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

// 從網址解析分頁 gid
function extractGid(input: string): number | null {
  const m = input.match(/[?#&]gid=(\d+)/);
  return m ? Number(m[1]) : null;
}

// 用 gid 查分頁名稱
async function resolveTabByGid(sheetId: string, gid: number, accessToken: string): Promise<string | null> {
  const res = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties(sheetId,title)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  return data.sheets?.find((s) => s.properties?.sheetId === gid)?.properties?.title ?? null;
}

const DETAIL_TAB = '健檢明細';

// 確保「健檢明細」分頁存在（沒有就建立），回傳分頁名稱
async function ensureDetailTab(sheetId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties(title)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return;
  const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  const exists = data.sheets?.some((s) => s.properties?.title === DETAIL_TAB);
  if (exists) return;
  await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: DETAIL_TAB } } }] }),
  });
}

// 把每項檢查的「問題頁明細」(details) 攤平寫進「健檢明細」分頁：
// 依「確認事項」合併——這次有送的項目整批換新，沒送到的項目（例如另一階段）保留原樣，
// 避免階段一、階段二分開寫入時互相洗掉對方的明細。
async function writeDetailsTab(
  sheetId: string,
  accessToken: string,
  checks: { level: string; category: string; item: string; status: string; details?: { url: string; note: string }[] }[],
): Promise<number> {
  const newRows = checks.flatMap((c) =>
    (c.details ?? []).map((d) => [c.item, STATUS_TEXT[c.status] ?? c.status, d.url, d.note]),
  );
  const touchedItems = new Set(checks.filter((c) => (c.details?.length ?? 0) > 0).map((c) => c.item));
  if (newRows.length === 0 && touchedItems.size === 0) return 0;

  await ensureDetailTab(sheetId, accessToken);

  // 讀出既有內容，保留不屬於這次送出項目的舊資料列（前兩列是日期列＋標題列）
  const readRes = await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(DETAIL_TAB)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const existing = readRes.ok ? (((await readRes.json()) as { values?: string[][] }).values ?? []) : [];
  const keptRows = existing.slice(2).filter((r) => r[0] && !touchedItems.has(r[0]));

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const values = [[`健檢日期：${today}（最後更新）`], ['確認事項', '狀態', '網址', '問題說明'], ...keptRows, ...newRows];

  // 先清空整頁再寫入（比照 Sheets 晶片下拉限制的既有作法：用 values:clear，不用 deleteDimension），避免舊資料殘留在新內容之後
  await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(DETAIL_TAB)}:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(DETAIL_TAB)}!A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });

  return keptRows.length + newRows.length;
}

// 純值儲存格（可選底色、粗體）；不含 dataValidation，寫入時保留格子既有的下拉晶片樣式
type Color = ReturnType<typeof rgb>;
function cell(value: string, bg?: Color, bold = false) {
  const cd: Record<string, unknown> = { userEnteredValue: { stringValue: value } };
  const fmt: Record<string, unknown> = {};
  if (bg) fmt.backgroundColor = bg;
  if (bold) fmt.textFormat = { bold: true };
  if (bg || bold) cd.userEnteredFormat = fmt;
  return cd;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    sheetUrl?: string;
    checks?: { level: string; category: string; item: string; status: string; advice: string; details?: { url: string; note: string }[] }[];
  };

  const sheetId = body.sheetUrl ? extractSheetId(body.sheetUrl) : null;
  if (!sheetId) return NextResponse.json({ error: '進度表網址不正確，請貼 Google Sheet 連結' }, { status: 400 });
  const gid = body.sheetUrl ? extractGid(body.sheetUrl) : null;
  if (gid === null) return NextResponse.json({ error: '無法辨識分頁：請切到目標分頁後複製含 gid 的網址' }, { status: 400 });
  if (!body.checks?.length) return NextResponse.json({ error: '沒有可寫入的健檢結果' }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  const tab = await resolveTabByGid(sheetId, gid, accessToken);
  if (!tab) return NextResponse.json({ error: '找不到該 gid 對應的分頁' }, { status: 400 });

  // 讀整個分頁
  const readRes = await fetch(`${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(tab)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!readRes.ok) {
    const err = (await readRes.json()) as { error?: { message: string } };
    return NextResponse.json({ error: `讀取進度表失敗：${err.error?.message ?? readRes.status}` }, { status: 502 });
  }
  const rows = ((await readRes.json()) as { values?: string[][] }).values ?? [];

  // 找標題列與各欄位置
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
    return NextResponse.json({ error: '在分頁前 10 列找不到「確認事項」標題，請確認網址分頁是否正確' }, { status: 400 });
  }
  const header = rows[headerRowIdx];
  let statusCol = header.findIndex((c) => c?.trim() === '狀態');
  if (statusCol === -1) statusCol = itemCol - 1;
  if (statusCol < 0) return NextResponse.json({ error: '找不到「狀態」欄，請確認表格欄位順序' }, { status: 400 });
  const levelCol = header.findIndex((c) => c?.trim() === '影響層級');
  const categoryCol = header.findIndex((c) => c?.trim() === '分類');
  const adviceCol = header.findIndex((c) => c?.trim() === 'SEO 建議事項');
  const maxCol = Math.max(levelCol, categoryCol, statusCol, itemCol, adviceCol);

  // 確認事項 → 列號；同時收集「確認事項為空」的預留列（給補列填值用）
  const itemToRow = new Map<string, number>();
  const blankRows: number[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const name = rows[r][itemCol]?.trim();
    if (name) itemToRow.set(name, r);
    else blankRows.push(r);
  }

  // 針對某列的某些欄，組 updateCells 純值請求（fields 只動值，保留格子既有下拉晶片樣式）
  const requests: unknown[] = [];
  const setRowValues = (rowIdx: number, cells: { col: number; cd: Record<string, unknown> }[], withFormat = false) => {
    for (const { col, cd } of cells) {
      requests.push({
        updateCells: {
          range: { sheetId: gid, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          rows: [{ values: [cd] }],
          fields: withFormat ? 'userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat' : 'userEnteredValue',
        },
      });
    }
  };
  // 補列時把一整列的欄位湊起來（只填值，不動格式）
  const rowCells = (check: { level: string; category: string; item: string; status: string; advice: string }, text: string) => {
    const cs: { col: number; cd: Record<string, unknown> }[] = [];
    if (levelCol !== -1) cs.push({ col: levelCol, cd: cell(check.level) });
    if (categoryCol !== -1) cs.push({ col: categoryCol, cd: cell(check.category) });
    cs.push({ col: statusCol, cd: cell(text) });
    cs.push({ col: itemCol, cd: cell(check.item, undefined, true) });
    if (adviceCol !== -1) cs.push({ col: adviceCol, cd: cell(check.advice) });
    return cs;
  };

  let updated = 0;
  let filled = 0; // 填進預留列
  const appendRows: { values: unknown[] }[] = [];
  const appendedItems: string[] = [];
  let bi = 0; // 預留列指標

  // 先預留一列給「日期：」分隔（放在補列區最前面）
  const needDateRow = body.checks.some((c) => !itemToRow.has(c.item.trim()));

  if (needDateRow) {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    if (bi < blankRows.length) {
      const r = blankRows[bi++];
      setRowValues(r, [
        { col: Math.max(levelCol, 0), cd: cell('日期：', DATE_COLOR, true) },
        { col: Math.max(categoryCol, 1), cd: cell(today, DATE_COLOR, true) },
        { col: itemCol, cd: cell('網站技術健檢報告', DATE_COLOR, true) },
      ], true);
    } else {
      const values: unknown[] = Array.from({ length: maxCol + 1 }, () => ({ userEnteredFormat: { backgroundColor: DATE_COLOR } }));
      values[Math.max(levelCol, 0)] = cell('日期：', DATE_COLOR, true);
      values[Math.max(categoryCol, 1)] = cell(today, DATE_COLOR, true);
      values[itemCol] = cell('網站技術健檢報告', DATE_COLOR, true);
      appendRows.push({ values });
    }
  }

  for (const check of body.checks) {
    const text = STATUS_TEXT[check.status] ?? check.status;
    const rowIdx = itemToRow.get(check.item.trim());
    if (rowIdx !== undefined) {
      // 既有列：只改狀態欄的值
      setRowValues(rowIdx, [{ col: statusCol, cd: cell(text) }]);
      updated++;
      continue;
    }
    // 補列：優先填進預留空列（繼承晶片樣式），不足才 append
    if (bi < blankRows.length) {
      setRowValues(blankRows[bi++], rowCells(check, text));
      filled++;
    } else {
      const values: unknown[] = Array.from({ length: maxCol + 1 }, () => ({}));
      for (const { col, cd } of rowCells(check, text)) values[col] = cd;
      appendRows.push({ values });
    }
    appendedItems.push(check.item);
  }

  if (appendRows.length > 0) {
    requests.push({ appendCells: { sheetId: gid, rows: appendRows, fields: 'userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat' } });
  }

  if (requests.length > 0) {
    const batchRes = await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    if (!batchRes.ok) {
      const err = (await batchRes.json()) as { error?: { message: string } };
      return NextResponse.json({ error: `寫入進度表失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
    }
  }

  const detailRows = await writeDetailsTab(sheetId, accessToken, body.checks);

  return NextResponse.json({ updated, appended: appendedItems.length, appendedItems, filledBlankRows: filled, detailRows });
}
