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
  }
  return _db;
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

// id = 0 是「舊版資料」的虛擬來源：搬遷這個功能之前，使用者已經手動填寫或上傳過的內容
// 直接留在 writer_brand_profiles 三個欄位裡，不額外搬資料，只是讀取/合併/刪除時一併當作一筆來源處理
export type BrandPdfSource = {
  id: number;
  gsc_client_id: number;
  title: string;
  brand_description: string;
  writing_rules: string;
  banned_words: string;
  created_at: string;
};

function mergeSources(sources: { title: string; brand_description: string; writing_rules: string; banned_words: string }[]) {
  function mergeField(field: 'brand_description' | 'writing_rules' | 'banned_words'): string {
    return sources
      .filter(s => s[field].trim())
      .map(s => s.title.trim() ? `【${s.title.trim()}】\n${s[field].trim()}` : s[field].trim())
      .join('\n\n');
  }
  return {
    brand_description: mergeField('brand_description'),
    writing_rules: mergeField('writing_rules'),
    banned_words: mergeField('banned_words'),
  };
}

export function listBrandPdfSources(gscClientId: number): BrandPdfSource[] {
  const baseRow = db().prepare('SELECT brand_description, writing_rules, banned_words FROM writer_brand_profiles WHERE gsc_client_id = ?')
    .get(gscClientId) as { brand_description: string; writing_rules: string; banned_words: string } | undefined;
  const legacy: BrandPdfSource[] = baseRow && (baseRow.brand_description || baseRow.writing_rules || baseRow.banned_words)
    ? [{ id: 0, gsc_client_id: gscClientId, title: '舊版資料', ...baseRow, created_at: '' }]
    : [];
  const rows = db().prepare('SELECT * FROM writer_brand_pdf_sources WHERE gsc_client_id = ? ORDER BY created_at ASC, id ASC')
    .all(gscClientId) as BrandPdfSource[];
  return [...legacy, ...rows];
}

export function addBrandPdfSource(gscClientId: number, title: string, brandDescription: string, writingRules: string, bannedWords: string): BrandPdfSource {
  // 確保 writer_brand_profiles 已有這個客戶的基底列（存 brand_url），否則只存在 PDF 來源表的客戶不會出現在 listBrandProfiles()
  db().prepare('INSERT INTO writer_brand_profiles (gsc_client_id) VALUES (?) ON CONFLICT(gsc_client_id) DO NOTHING').run(gscClientId);
  const result = db().prepare(
    'INSERT INTO writer_brand_pdf_sources (gsc_client_id, title, brand_description, writing_rules, banned_words) VALUES (?, ?, ?, ?, ?)'
  ).run(gscClientId, title, brandDescription, writingRules, bannedWords);
  return db().prepare('SELECT * FROM writer_brand_pdf_sources WHERE id = ?').get(result.lastInsertRowid) as BrandPdfSource;
}

export function deleteBrandPdfSource(gscClientId: number, id: number): void {
  if (id === 0) {
    db().prepare(`UPDATE writer_brand_profiles SET brand_description = '', writing_rules = '', banned_words = '' WHERE gsc_client_id = ?`).run(gscClientId);
    return;
  }
  db().prepare('DELETE FROM writer_brand_pdf_sources WHERE id = ? AND gsc_client_id = ?').run(id, gscClientId);
}

// 只給「舊版資料」(id=0) 這一筆專用：標題固定顯示「舊版資料」，不存資料庫、不可改
export function updateLegacyBrandSource(gscClientId: number, brandDescription: string, writingRules: string, bannedWords: string): void {
  db().prepare(
    `UPDATE writer_brand_profiles SET brand_description = ?, writing_rules = ?, banned_words = ? WHERE gsc_client_id = ?`
  ).run(brandDescription, writingRules, bannedWords, gscClientId);
}

export function listBrandProfiles(): BrandProfile[] {
  const rows = db().prepare('SELECT gsc_client_id, brand_url, updated_at FROM writer_brand_profiles').all() as Pick<BrandProfile, 'gsc_client_id' | 'brand_url' | 'updated_at'>[];
  return rows.map(row => ({ ...row, ...mergeSources(listBrandPdfSources(row.gsc_client_id)) }));
}

export function getBrandProfile(gscClientId: number): BrandProfile | null {
  const row = db().prepare('SELECT gsc_client_id, brand_url, updated_at FROM writer_brand_profiles WHERE gsc_client_id = ?')
    .get(gscClientId) as Pick<BrandProfile, 'gsc_client_id' | 'brand_url' | 'updated_at'> | undefined;
  if (!row) return null;
  return { ...row, ...mergeSources(listBrandPdfSources(gscClientId)) };
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

// 品牌描述／寫文規範／禁詞改由 PDF 來源（見 BrandPdfSource）自動合併產生，這裡只負責手動填寫的品牌網址
export function upsertBrandProfile(gscClientId: number, brandUrl: string): void {
  db().prepare(
    `INSERT INTO writer_brand_profiles (gsc_client_id, brand_url, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(gsc_client_id) DO UPDATE SET
       brand_url = excluded.brand_url,
       updated_at = excluded.updated_at`
  ).run(gscClientId, brandUrl);
}
