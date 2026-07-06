import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 草稿資料庫：跟其他功能一樣放在 data/（Zeabur 掛載的 volume，資料持久）
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tkd.db'));

// TKD 兩階段草稿：階段一（寫入現有 TKD）完成後存一筆，之後可從草稿直接進階段二（填關鍵字生建議）
db.exec(`
  CREATE TABLE IF NOT EXISTS tkd_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    site_url TEXT NOT NULL,
    sheet_url TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'important',
    pages TEXT NOT NULL DEFAULT '[]',
    page_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// 草稿裡的一頁：網址＋選單名（顯示用）＋AI 判的型態（顯示用）
export type DraftPage = { url: string; label?: string; type?: string };

// 資料表原始列（pages 是 JSON 字串）
interface DraftRow {
  id: number;
  name: string;
  site_url: string;
  sheet_url: string;
  scope: string;
  pages: string;
  page_count: number;
  created_at: string;
  updated_at: string;
}

// 對外的草稿型別（pages 已解析成陣列）
export interface TkdDraft {
  id: number;
  name: string;
  siteUrl: string;
  sheetUrl: string;
  scope: 'important' | 'all';
  pages: DraftPage[];
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

// 資料表列 → 對外型別（解析 pages JSON，壞掉就給空陣列）
function toDraft(r: DraftRow): TkdDraft {
  let pages: DraftPage[] = [];
  try {
    const parsed = JSON.parse(r.pages);
    if (Array.isArray(parsed)) pages = parsed;
  } catch {
    /* pages 壞掉就當空的 */
  }
  return {
    id: r.id,
    name: r.name,
    siteUrl: r.site_url,
    sheetUrl: r.sheet_url,
    scope: r.scope === 'all' ? 'all' : 'important',
    pages,
    pageCount: r.page_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 建立草稿，回傳新草稿 id
export function createDraft(input: {
  name: string;
  siteUrl: string;
  sheetUrl: string;
  scope: 'important' | 'all';
  pages: DraftPage[];
}): number {
  const info = db
    .prepare(
      `INSERT INTO tkd_drafts (name, site_url, sheet_url, scope, pages, page_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.siteUrl,
      input.sheetUrl,
      input.scope,
      JSON.stringify(input.pages),
      input.pages.length,
    );
  return Number(info.lastInsertRowid);
}

// 草稿清單（新到舊；不含 pages 明細，清單顯示用）
export function listDrafts(): Omit<TkdDraft, 'pages'>[] {
  const rows = db
    .prepare(
      `SELECT id, name, site_url, sheet_url, scope, page_count, created_at, updated_at
       FROM tkd_drafts ORDER BY updated_at DESC, id DESC`,
    )
    .all() as Omit<DraftRow, 'pages'>[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    siteUrl: r.site_url,
    sheetUrl: r.sheet_url,
    scope: r.scope === 'all' ? 'all' : 'important',
    pageCount: r.page_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// 讀單一草稿（含 pages 明細）；找不到回 null
export function getDraft(id: number): TkdDraft | null {
  const row = db.prepare('SELECT * FROM tkd_drafts WHERE id = ?').get(id) as DraftRow | undefined;
  return row ? toDraft(row) : null;
}

// 刪草稿，回傳是否有刪到
export function deleteDraft(id: number): boolean {
  return db.prepare('DELETE FROM tkd_drafts WHERE id = ?').run(id).changes > 0;
}
