import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';

// 把網站技術健檢結果寫回進度表：
//  - 確認事項對到既有列 → 更新該列「狀態」欄（含底色、下拉）
//  - 找不到對應列 → 在分頁尾端補列，前面加一列「日期：」分隔，
//    補的列自帶下拉選單（資料驗證）與膠囊底色，格式跟人工建的一致
// 帳號共用 GSC 那組 OAuth（SEO 信箱），scope 已含 spreadsheets 讀寫。
export const maxDuration = 60;

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// 狀態代碼 → 表上中文用語
const STATUS_TEXT: Record<string, string> = { ok: '正常', warn: '可優化', fail: '需處理' };

// 各欄膠囊底色（RGB 0~1，對齊進度表既有配色）
const rgb = (red: number, green: number, blue: number) => ({ red, green, blue });
const LEVEL_COLORS: Record<string, ReturnType<typeof rgb>> = {
  '直接影響收錄 / 排名': rgb(0.96, 0.83, 0.80),
  '影響效率 / 放大成效': rgb(1, 0.90, 0.75),
  '品質優化 / 中長期': rgb(0.87, 0.93, 0.83),
};
const CATEGORY_COLORS: Record<string, ReturnType<typeof rgb>> = {
  '成效與追蹤': rgb(0.82, 0.89, 0.95),
  '技術面': rgb(1, 0.95, 0.75),
  '在地與品牌': rgb(1, 0.88, 0.75),
  '網站結構': rgb(0.90, 0.85, 0.95),
  '內容與頁面': rgb(0.97, 0.88, 0.82),
  '外部權重': rgb(0.97, 0.80, 0.80),
};
const STATUS_COLORS: Record<string, ReturnType<typeof rgb>> = {
  '正常': rgb(0.85, 0.93, 0.83),
  '需處理': rgb(0.97, 0.80, 0.80),
  '可優化': rgb(1, 0.95, 0.70),
};
const DATE_COLOR = rgb(0.99, 0.87, 0.76); // 日期分隔列橘底

const LEVEL_OPTIONS = Object.keys(LEVEL_COLORS);
const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);
const STATUS_OPTIONS = ['正常', '需處理', '可優化'];

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

// 用 gid 查分頁名稱（讀值用）
async function resolveTabByGid(sheetId: string, gid: number, accessToken: string): Promise<string | null> {
  const res = await fetch(`${SHEETS_BASE}/${sheetId}?fields=sheets.properties(sheetId,title)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  return data.sheets?.find((s) => s.properties?.sheetId === gid)?.properties?.title ?? null;
}

// 一個儲存格：值＋底色＋下拉選單＋可選粗體
type Color = ReturnType<typeof rgb>;
function cell(value: string, bg?: Color, options?: string[], bold = false) {
  const cd: Record<string, unknown> = { userEnteredValue: { stringValue: value } };
  const fmt: Record<string, unknown> = { verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' };
  if (bg) fmt.backgroundColor = bg;
  if (bold) fmt.textFormat = { bold: true };
  cd.userEnteredFormat = fmt;
  if (options) {
    cd.dataValidation = {
      condition: { type: 'ONE_OF_LIST', values: options.map((o) => ({ userEnteredValue: o })) },
      strict: false,
      showCustomUi: true,
    };
  }
  return cd;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    sheetUrl?: string;
    checks?: { level: string; category: string; item: string; status: string; advice: string }[];
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

  // 找標題列（含「確認事項」）與各欄位置
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

  // 確認事項 → 列號
  const itemToRow = new Map<string, number>();
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const name = rows[r][itemCol]?.trim();
    if (name) itemToRow.set(name, r);
  }

  // 逐項比對：找到→更新狀態欄；找不到→組整列準備補
  const requests: unknown[] = [];
  const appendRows: { values: unknown[] }[] = [];
  const appendedItems: string[] = [];
  let updated = 0;

  for (const check of body.checks) {
    const text = STATUS_TEXT[check.status] ?? check.status;
    const rowIdx = itemToRow.get(check.item.trim());
    if (rowIdx !== undefined) {
      // 更新既有列的狀態欄（值＋底色＋下拉）
      requests.push({
        updateCells: {
          range: { sheetId: gid, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: statusCol, endColumnIndex: statusCol + 1 },
          rows: [{ values: [cell(text, STATUS_COLORS[text], STATUS_OPTIONS)] }],
          fields: 'userEnteredValue,userEnteredFormat.backgroundColor,dataValidation',
        },
      });
      updated++;
      continue;
    }
    // 補列：整列自帶膠囊底色＋下拉
    const values: unknown[] = Array.from({ length: maxCol + 1 }, () => ({}));
    if (levelCol !== -1) values[levelCol] = cell(check.level, LEVEL_COLORS[check.level], LEVEL_OPTIONS);
    if (categoryCol !== -1) values[categoryCol] = cell(check.category, CATEGORY_COLORS[check.category], CATEGORY_OPTIONS);
    values[statusCol] = cell(text, STATUS_COLORS[text], STATUS_OPTIONS);
    values[itemCol] = cell(check.item, undefined, undefined, true);
    if (adviceCol !== -1) values[adviceCol] = cell(check.advice);
    appendRows.push({ values });
    appendedItems.push(check.item);
  }

  // 有要補的列時，前面加一列「日期：」分隔列
  if (appendRows.length > 0) {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    const dateValues: unknown[] = Array.from({ length: maxCol + 1 }, () => ({ userEnteredFormat: { backgroundColor: DATE_COLOR } }));
    dateValues[Math.max(levelCol, 0)] = cell('日期：', DATE_COLOR, undefined, true);
    dateValues[Math.max(categoryCol, 1)] = cell(today, DATE_COLOR, undefined, true);
    dateValues[itemCol] = cell('網站技術健檢報告', DATE_COLOR, undefined, true);
    requests.push({ appendCells: { sheetId: gid, rows: [{ values: dateValues }, ...appendRows], fields: '*' } });
  }

  if (requests.length === 0) return NextResponse.json({ updated: 0, appended: 0, appendedItems: [] });

  // 一次送出所有 updateCells / appendCells
  const batchRes = await fetch(`${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) {
    const err = (await batchRes.json()) as { error?: { message: string } };
    return NextResponse.json({ error: `寫入進度表失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
  }

  return NextResponse.json({ updated, appended: appendedItems.length, appendedItems });
}
