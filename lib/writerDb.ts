import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'writer.db');

let _db: ReturnType<typeof Database> | null = null;

function db() {
  if (!_db) {
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
    `);
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
};

const SETTING_DEFAULTS: WriterSettings = {
  schedule_sheet_id: '',
  schedule_sheet_tab: '',
  clients_sheet_id: '',
  clients_sheet_tab: '',
  progress_tracking_sheet_id: '',
};

export function getSettings(): WriterSettings {
  const rows = db().prepare('SELECT key, value FROM writer_settings').all() as { key: string; value: string }[];
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...SETTING_DEFAULTS, ...map } as WriterSettings;
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
