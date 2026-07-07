import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 網站技術健檢：兩階段草稿資料庫（跟 tkd.db 一樣放 data/，Zeabur 掛載 volume、資料持久）
// 階段一（登記上半 10 項、寫回進度表）完成後存一筆草稿，之後可從草稿續做階段二（下半 12 項）。
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'site-audit.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS site_audit_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,                       -- 健檢的頁面網址
    sheet_url TEXT NOT NULL DEFAULT '',      -- 進度表網址（含 gid，寫回用）
    stage1_checks TEXT NOT NULL DEFAULT '[]',-- 階段一結果 JSON（續做時顯示用）
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// 草稿裡存的單項健檢結果（對應前端 CheckItem，欄位精簡）
export type DraftCheck = {
  key: string;
  level: string;
  category: string;
  item: string;
  status: string;
  advice: string;
  evidence?: string;
  stage?: number;
};

// 資料表原始列（stage1_checks 是 JSON 字串）
interface DraftRow {
  id: number;
  name: string;
  url: string;
  sheet_url: string;
  stage1_checks: string;
  created_at: string;
  updated_at: string;
}

// 對外的草稿型別（stage1Checks 已解析成陣列）
export interface AuditDraft {
  id: number;
  name: string;
  url: string;
  sheetUrl: string;
  stage1Checks: DraftCheck[];
  createdAt: string;
  updatedAt: string;
}

// 資料表列 → 對外型別（解析 JSON，壞掉就給空陣列）
function toDraft(r: DraftRow): AuditDraft {
  let stage1Checks: DraftCheck[] = [];
  try {
    const parsed = JSON.parse(r.stage1_checks);
    if (Array.isArray(parsed)) stage1Checks = parsed;
  } catch {
    /* 壞掉就當空的 */
  }
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    sheetUrl: r.sheet_url,
    stage1Checks,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 建立草稿，回傳新草稿 id
export function createDraft(input: {
  name: string;
  url: string;
  sheetUrl: string;
  stage1Checks: DraftCheck[];
}): number {
  const info = db
    .prepare(
      `INSERT INTO site_audit_drafts (name, url, sheet_url, stage1_checks)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.name, input.url, input.sheetUrl, JSON.stringify(input.stage1Checks));
  return Number(info.lastInsertRowid);
}

// 草稿清單（新到舊；不含 stage1_checks 明細）
export function listDrafts(): Omit<AuditDraft, 'stage1Checks'>[] {
  const rows = db
    .prepare(
      `SELECT id, name, url, sheet_url, created_at, updated_at
       FROM site_audit_drafts ORDER BY updated_at DESC, id DESC`,
    )
    .all() as Omit<DraftRow, 'stage1_checks'>[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    sheetUrl: r.sheet_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// 讀單一草稿（含階段一明細）；找不到回 null
export function getDraft(id: number): AuditDraft | null {
  const row = db.prepare('SELECT * FROM site_audit_drafts WHERE id = ?').get(id) as DraftRow | undefined;
  return row ? toDraft(row) : null;
}

// 刪草稿，回傳是否有刪到
export function deleteDraft(id: number): boolean {
  return db.prepare('DELETE FROM site_audit_drafts WHERE id = ?').run(id).changes > 0;
}
