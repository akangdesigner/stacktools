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
    checks?: { item: string; status: string }[];
  };

  const sheetId = body.sheetUrl ? extractSheetId(body.sheetUrl) : null;
  if (!sheetId) return NextResponse.json({ error: '進度表網址不正確，請貼 Google Sheet 連結' }, { status: 400 });
  const tab = body.tab?.trim();
  if (!tab) return NextResponse.json({ error: '請填寫要寫入的分頁名稱' }, { status: 400 });
  if (!body.checks?.length) return NextResponse.json({ error: '沒有可寫入的健檢結果' }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
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

  // 建「確認事項文字 → 列號」對應表（資料列從標題列的下一列開始）
  const itemToRow = new Map<string, number>();
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const name = rows[r][itemCol]?.trim();
    if (name) itemToRow.set(name, r);
  }

  // 逐項比對，湊出要更新的儲存格
  const updates: { range: string; value: string }[] = [];
  const notFound: string[] = [];
  for (const check of body.checks) {
    const rowIdx = itemToRow.get(check.item.trim());
    if (rowIdx === undefined) {
      notFound.push(check.item);
      continue;
    }
    const text = STATUS_TEXT[check.status] ?? check.status;
    updates.push({ range: `${tab}!${colLetter(statusCol)}${rowIdx + 1}`, value: text });
  }

  if (updates.length === 0) {
    return NextResponse.json({ updated: 0, notFound });
  }

  // 批次寫入狀態欄
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
    return NextResponse.json({ error: `寫入進度表失敗：${err.error?.message ?? batchRes.status}` }, { status: 502 });
  }

  return NextResponse.json({ updated: updates.length, notFound });
}
