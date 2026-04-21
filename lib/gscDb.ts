import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gsc.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gsc_clients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    site_url    TEXT NOT NULL,
    sheet_id    TEXT NOT NULL DEFAULT '',
    sheet_tab   TEXT NOT NULL DEFAULT '',
    auto_update INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gsc_keywords (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES gsc_clients(id) ON DELETE CASCADE,
    keyword   TEXT NOT NULL,
    label     TEXT NOT NULL DEFAULT ''
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS gsc_article_pages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES gsc_clients(id) ON DELETE CASCADE,
    type      TEXT NOT NULL DEFAULT '',
    title     TEXT NOT NULL DEFAULT '',
    url       TEXT NOT NULL
  );
`);

// 遷移：舊資料庫加欄位
try { db.exec(`ALTER TABLE gsc_clients ADD COLUMN sheet_id             TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE gsc_clients ADD COLUMN sheet_tab            TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE gsc_clients ADD COLUMN auto_update          INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE gsc_clients ADD COLUMN article_sheet_id    TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE gsc_clients ADD COLUMN article_sheet_tab   TEXT NOT NULL DEFAULT ''`); } catch {}

// ── KV ──────────────────────────────────────────────
export function getKv(key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setKv(key: string, value: string): void {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getToken(): string | null {
  return getKv('refresh_token');
}

export function setToken(token: string): void {
  setKv('refresh_token', token);
}

// ── Clients ─────────────────────────────────────────
export interface GscClient {
  id: number;
  name: string;
  site_url: string;
  sheet_id: string;
  sheet_tab: string;
  auto_update: number;
  article_sheet_id: string;
  article_sheet_tab: string;
}

export interface GscArticlePage {
  id: number;
  client_id: number;
  type: string;
  title: string;
  url: string;
}

export interface GscKeyword {
  id: number;
  client_id: number;
  keyword: string;
  label: string;
}

export function listClients(): GscClient[] {
  return db.prepare('SELECT * FROM gsc_clients ORDER BY id').all() as GscClient[];
}

export function createClient(name: string, site_url: string): GscClient {
  const result = db.prepare('INSERT INTO gsc_clients (name, site_url) VALUES (?, ?)').run(name, site_url);
  return { id: result.lastInsertRowid as number, name, site_url, sheet_id: '', sheet_tab: '', auto_update: 0, article_sheet_id: '', article_sheet_tab: '' };
}

export function updateClient(id: number, name: string, site_url: string, sheet_id = '', sheet_tab = '', auto_update = 0, article_sheet_id = '', article_sheet_tab = ''): void {
  db.prepare('UPDATE gsc_clients SET name = ?, site_url = ?, sheet_id = ?, sheet_tab = ?, auto_update = ?, article_sheet_id = ?, article_sheet_tab = ? WHERE id = ?').run(name, site_url, sheet_id, sheet_tab, auto_update, article_sheet_id, article_sheet_tab, id);
}

export function deleteClient(id: number): void {
  db.prepare('DELETE FROM gsc_clients WHERE id = ?').run(id);
}

// ── Keywords ─────────────────────────────────────────
export function listKeywords(client_id: number): GscKeyword[] {
  return db.prepare('SELECT * FROM gsc_keywords WHERE client_id = ? ORDER BY id').all(client_id) as GscKeyword[];
}

export function addKeyword(client_id: number, keyword: string, label: string): GscKeyword {
  const result = db.prepare('INSERT INTO gsc_keywords (client_id, keyword, label) VALUES (?, ?, ?)').run(client_id, keyword, label);
  return { id: result.lastInsertRowid as number, client_id, keyword, label };
}

export function deleteKeyword(id: number): void {
  db.prepare('DELETE FROM gsc_keywords WHERE id = ?').run(id);
}

// ── Article Pages ────────────────────────────────────
export function listArticlePages(client_id: number): GscArticlePage[] {
  return db.prepare('SELECT * FROM gsc_article_pages WHERE client_id = ? ORDER BY id').all(client_id) as GscArticlePage[];
}

export function replaceArticlePages(client_id: number, pages: { type: string; title: string; url: string }[]): void {
  const del = db.prepare('DELETE FROM gsc_article_pages WHERE client_id = ?');
  const ins = db.prepare('INSERT INTO gsc_article_pages (client_id, type, title, url) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    del.run(client_id);
    for (const p of pages) ins.run(client_id, p.type, p.title, p.url);
  })();
}

export function replaceKeywords(client_id: number, keywords: { keyword: string; label: string }[]): void {
  const del = db.prepare('DELETE FROM gsc_keywords WHERE client_id = ?');
  const ins = db.prepare('INSERT INTO gsc_keywords (client_id, keyword, label) VALUES (?, ?, ?)');
  db.transaction(() => {
    del.run(client_id);
    for (const k of keywords) ins.run(client_id, k.keyword, k.label);
  })();
}
