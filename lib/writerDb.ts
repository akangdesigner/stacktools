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
        updated_at TEXT
      );
    `);
    try { _db.exec(`ALTER TABLE writer_brand_profiles ADD COLUMN writing_rules TEXT NOT NULL DEFAULT ''`); } catch { /* 欄位已存在 */ }
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

// ── User Clients（per login account）─────────────────────────────────

export type UserClient = {
  id: number;
  user_email: string;
  name: string;
  brand_url: string;
  brand_description: string;
  created_at: string;
};

export function listUserClients(userEmail: string): UserClient[] {
  return db().prepare('SELECT * FROM user_clients WHERE user_email = ? ORDER BY name').all(userEmail) as UserClient[];
}

export function upsertUserClient(userEmail: string, id: number | null, name: string, brandUrl: string, brandDescription: string): UserClient {
  if (id) {
    db().prepare(
      'UPDATE user_clients SET name = ?, brand_url = ?, brand_description = ? WHERE id = ? AND user_email = ?'
    ).run(name, brandUrl, brandDescription, id, userEmail);
    return db().prepare('SELECT * FROM user_clients WHERE id = ?').get(id) as UserClient;
  } else {
    const result = db().prepare(
      'INSERT INTO user_clients (user_email, name, brand_url, brand_description) VALUES (?, ?, ?, ?)'
    ).run(userEmail, name, brandUrl, brandDescription);
    return db().prepare('SELECT * FROM user_clients WHERE id = ?').get(result.lastInsertRowid) as UserClient;
  }
}

export function deleteUserClient(userEmail: string, id: number): void {
  db().prepare('DELETE FROM user_clients WHERE id = ? AND user_email = ?').run(id, userEmail);
}

// ── Brand Profiles（共用，以 GSC client ID 為鍵）─────────────────────

export type BrandProfile = {
  gsc_client_id: number;
  brand_url: string;
  brand_description: string;
  writing_rules: string;
  updated_at: string;
};

export function listBrandProfiles(): BrandProfile[] {
  return db().prepare('SELECT * FROM writer_brand_profiles').all() as BrandProfile[];
}

export function getBrandProfile(gscClientId: number): BrandProfile | null {
  return db().prepare('SELECT * FROM writer_brand_profiles WHERE gsc_client_id = ?').get(gscClientId) as BrandProfile | null;
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

export function upsertBrandProfile(gscClientId: number, brandUrl: string, brandDescription: string, writingRules: string): void {
  db().prepare(
    `INSERT INTO writer_brand_profiles (gsc_client_id, brand_url, brand_description, writing_rules, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(gsc_client_id) DO UPDATE SET
       brand_url = excluded.brand_url,
       brand_description = excluded.brand_description,
       writing_rules = excluded.writing_rules,
       updated_at = excluded.updated_at`
  ).run(gscClientId, brandUrl, brandDescription, writingRules);
}
