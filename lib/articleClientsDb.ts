import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ClientProfile } from '@/types';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'article.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_clients (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

export function listArticleClients(): ClientProfile[] {
  return getDb()
    .prepare('SELECT data FROM article_clients ORDER BY created_at ASC')
    .all()
    .map((row) => JSON.parse((row as { data: string }).data) as ClientProfile);
}

export function upsertArticleClient(profile: ClientProfile): void {
  getDb().prepare(`
    INSERT INTO article_clients (id, name, data)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data
  `).run(profile.id, profile.name, JSON.stringify(profile));
}

export function deleteArticleClient(id: string): void {
  getDb().prepare('DELETE FROM article_clients WHERE id = ?').run(id);
}
