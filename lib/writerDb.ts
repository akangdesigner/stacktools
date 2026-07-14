import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'writer.db');

let _db: ReturnType<typeof Database> | null = null;

function db() {
  if (!_db) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS writer_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        progress_sheet_id TEXT NOT NULL,
        progress_sheet_tab TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS writer_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS user_settings (
        user_email TEXT PRIMARY KEY,
        writing_guide TEXT NOT NULL DEFAULT '',
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS user_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        name TEXT NOT NULL,
        brand_url TEXT NOT NULL DEFAULT '',
        brand_description TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_prompt_overrides (
        user_email TEXT NOT NULL,
        stage TEXT NOT NULL,
        prompt_text TEXT NOT NULL DEFAULT '',
        updated_at TEXT,
        PRIMARY KEY (user_email, stage)
      );
      CREATE TABLE IF NOT EXISTS writer_brand_profiles (
        gsc_client_id INTEGER PRIMARY KEY,
        brand_url TEXT NOT NULL DEFAULT '',
        brand_description TEXT NOT NULL DEFAULT '',
        writing_rules TEXT NOT NULL DEFAULT '',
        banned_words TEXT NOT NULL DEFAULT '',
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS writer_brand_pdf_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gsc_client_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        brand_description TEXT NOT NULL DEFAULT '',
        writing_rules TEXT NOT NULL DEFAULT '',
        banned_words TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
    `);
    try { _db.exec(`ALTER TABLE writer_brand_profiles ADD COLUMN writing_rules TEXT NOT NULL DEFAULT ''`); } catch { /* 欄位已存在 */ }
    try { _db.exec(`ALTER TABLE writer_brand_profiles ADD COLUMN banned_words TEXT NOT NULL DEFAULT ''`); } catch { /* 欄位已存在 */ }
    migrateLegacyPdfSources(_db);
  }
  return _db;
}

// 一次性搬遷：品牌設定改成單一欄位直接編輯後，把過去每個客戶已上傳的 PDF 來源文字併回
// writer_brand_profiles 自己的三個欄位，併完清空來源表，之後這張表就不再使用
function migrateLegacyPdfSources(handle: ReturnType<typeof Database>): void {
  const sourceCount = (handle.prepare('SELECT COUNT(*) AS c FROM writer_brand_pdf_sources').get() as { c: number }).c;
  if (sourceCount === 0) return;

  const clientIds = handle.prepare('SELECT DISTINCT gsc_client_id FROM writer_brand_pdf_sources').all() as { gsc_client_id: number }[];
  const mergeField = (
    base: string,
    sources: { title: string; value: string }[]
  ): string => [
    base.trim(),
    ...sources.filter(s => s.value.trim()).map(s => s.title.trim() ? `【${s.title.trim()}】\n${s.value.trim()}` : s.value.trim()),
  ].filter(Boolean).join('\n\n');

  for (const { gsc_client_id } of clientIds) {
    const baseRow = handle.prepare('SELECT brand_description, writing_rules, banned_words FROM writer_brand_profiles WHERE gsc_client_id = ?')
      .get(gsc_client_id) as { brand_description: string; writing_rules: string; banned_words: string } | undefined;
    const sources = handle.prepare('SELECT title, brand_description, writing_rules, banned_words FROM writer_brand_pdf_sources WHERE gsc_client_id = ? ORDER BY created_at ASC, id ASC')
      .all(gsc_client_id) as { title: string; brand_description: string; writing_rules: string; banned_words: string }[];

    const merged = {
      brand_description: mergeField(baseRow?.brand_description ?? '', sources.map(s => ({ title: s.title, value: s.brand_description }))),
      writing_rules: mergeField(baseRow?.writing_rules ?? '', sources.map(s => ({ title: s.title, value: s.writing_rules }))),
      banned_words: mergeField(baseRow?.banned_words ?? '', sources.map(s => ({ title: s.title, value: s.banned_words }))),
    };

    handle.prepare(
      `INSERT INTO writer_brand_profiles (gsc_client_id, brand_description, writing_rules, banned_words, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(gsc_client_id) DO UPDATE SET
         brand_description = excluded.brand_description,
         writing_rules = excluded.writing_rules,
         banned_words = excluded.banned_words,
         updated_at = excluded.updated_at`
    ).run(gsc_client_id, merged.brand_description, merged.writing_rules, merged.banned_words);
  }

  handle.exec('DELETE FROM writer_brand_pdf_sources');
}

export type WriterClient = {
  id: number;
  name: string;
  progress_sheet_id: string;
  progress_sheet_tab: string;
  created_at: string;
};

export type WriterSettings = {
  schedule_sheet_id: string;
  schedule_sheet_tab: string;
  clients_sheet_id: string;
  clients_sheet_tab: string;
  progress_tracking_sheet_id: string;
  openrouter_model: string;
};

const SETTING_DEFAULTS: WriterSettings = {
  schedule_sheet_id: '',
  schedule_sheet_tab: '',
  clients_sheet_id: '',
  clients_sheet_tab: '',
  progress_tracking_sheet_id: '',
  openrouter_model: 'openai/gpt-4o-mini',
};

// 全域寫作指引的預設內容：沒填過個人指引的帳號會自動帶入這份，修改後存檔即成為自己的版本
export const DEFAULT_WRITING_GUIDE = `內容品質規則（每句都要符合）：
- 每句必須有新資訊或判斷，不重複說法，不加空泛轉場句。
- 禁用「先否定再肯定」句型：不是A而是B、不只是A更是B、不應該A而應該B。
- 格式依內容性質：說明型→段落；條件/注意→項目符號（**粗體**：說明）；步驟→編號；比較→表格。若該段落的具體指示明確要求改用 "- " 開頭的 Markdown 條列格式，則以該指示為準，不適用本條的粗體項目符號慣例。`;

// 已退役的 OpenRouter 型號 → 新版對應（舊瀏覽器頁面可能把退役型號存回來）
const MODEL_ALIASES: Record<string, string> = {
  'anthropic/claude-3.5-sonnet-20241022': 'anthropic/claude-sonnet-4.6',
  'anthropic/claude-3-haiku-20240307': 'anthropic/claude-haiku-4.5',
  'google/gemini-1.5-flash': 'google/gemini-2.5-flash',
  'google/gemini-1.5-pro': 'google/gemini-2.5-pro',
};

export function getSettings(): WriterSettings {
  const rows = db().prepare('SELECT key, value FROM writer_settings').all() as { key: string; value: string }[];
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const settings = { ...SETTING_DEFAULTS, ...map } as WriterSettings;
  settings.openrouter_model = MODEL_ALIASES[settings.openrouter_model] ?? settings.openrouter_model;
  return settings;
}

export function setSetting(key: keyof WriterSettings, value: string): void {
  db().prepare('INSERT INTO writer_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// ── Clients ──────────────────────────────────────────────────────────

export function listClients(): WriterClient[] {
  return db().prepare('SELECT * FROM writer_clients ORDER BY name').all() as WriterClient[];
}

export function addClient(name: string, progressSheetId: string, progressSheetTab = ''): WriterClient {
  const stmt = db().prepare(
    'INSERT INTO writer_clients (name, progress_sheet_id, progress_sheet_tab) VALUES (?, ?, ?)'
  );
  const result = stmt.run(name, progressSheetId, progressSheetTab);
  return db().prepare('SELECT * FROM writer_clients WHERE id = ?').get(result.lastInsertRowid) as WriterClient;
}

export function deleteClient(id: number): void {
  db().prepare('DELETE FROM writer_clients WHERE id = ?').run(id);
}

export function updateClient(id: number, name: string, progressSheetId: string, progressSheetTab = ''): void {
  db().prepare(
    'UPDATE writer_clients SET name = ?, progress_sheet_id = ?, progress_sheet_tab = ? WHERE id = ?'
  ).run(name, progressSheetId, progressSheetTab, id);
}

// ── User Settings（per login account）────────────────────────────────

export function getUserWritingGuide(userEmail: string): string {
  const row = db().prepare('SELECT writing_guide FROM user_settings WHERE user_email = ?').get(userEmail) as { writing_guide: string } | undefined;
  return row?.writing_guide ?? '';
}

export function setUserWritingGuide(userEmail: string, guide: string): void {
  db().prepare(
    'INSERT INTO user_settings (user_email, writing_guide, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(user_email) DO UPDATE SET writing_guide = excluded.writing_guide, updated_at = excluded.updated_at'
  ).run(userEmail, guide);
}

// ── Brand Profiles（共用，以 GSC client ID 為鍵）─────────────────────

export type BrandProfile = {
  gsc_client_id: number;
  brand_url: string;
  brand_description: string;
  writing_rules: string;
  banned_words: string;
  updated_at: string;
};

export function listBrandProfiles(): BrandProfile[] {
  return db().prepare('SELECT gsc_client_id, brand_url, brand_description, writing_rules, banned_words, updated_at FROM writer_brand_profiles').all() as BrandProfile[];
}

export function getBrandProfile(gscClientId: number): BrandProfile | null {
  const row = db().prepare('SELECT gsc_client_id, brand_url, brand_description, writing_rules, banned_words, updated_at FROM writer_brand_profiles WHERE gsc_client_id = ?')
    .get(gscClientId) as BrandProfile | undefined;
  return row ?? null;
}

export function getUserPromptOverrides(userEmail: string): Record<string, string> {
  const rows = db().prepare('SELECT stage, prompt_text FROM user_prompt_overrides WHERE user_email = ?').all(userEmail) as { stage: string; prompt_text: string }[];
  return Object.fromEntries(rows.map(r => [r.stage, r.prompt_text]));
}

export function setUserPromptOverride(userEmail: string, stage: string, promptText: string): void {
  db().prepare(
    `INSERT INTO user_prompt_overrides (user_email, stage, prompt_text, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_email, stage) DO UPDATE SET prompt_text = excluded.prompt_text, updated_at = excluded.updated_at`
  ).run(userEmail, stage, promptText);
}

export function deleteUserPromptOverride(userEmail: string, stage: string): void {
  db().prepare('DELETE FROM user_prompt_overrides WHERE user_email = ? AND stage = ?').run(userEmail, stage);
}

export function upsertBrandProfile(
  gscClientId: number,
  data: { brand_url: string; brand_description: string; writing_rules: string; banned_words: string }
): void {
  db().prepare(
    `INSERT INTO writer_brand_profiles (gsc_client_id, brand_url, brand_description, writing_rules, banned_words, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(gsc_client_id) DO UPDATE SET
       brand_url = excluded.brand_url,
       brand_description = excluded.brand_description,
       writing_rules = excluded.writing_rules,
       banned_words = excluded.banned_words,
       updated_at = excluded.updated_at`
  ).run(gscClientId, data.brand_url, data.brand_description, data.writing_rules, data.banned_words);
}
