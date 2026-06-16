import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'silver.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS news_preferences (
    userId TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

export interface NewsPreference {
  userId: string;
  category: string;
  updatedAt: string;
}

export function getPreference(userId: string): NewsPreference | null {
  return (db.prepare('SELECT * FROM news_preferences WHERE userId = ?').get(userId) as NewsPreference) ?? null;
}

export function getAllPreferences(): NewsPreference[] {
  return db.prepare('SELECT * FROM news_preferences').all() as NewsPreference[];
}

export function upsertPreference(userId: string, category: string): void {
  db.prepare(`
    INSERT INTO news_preferences (userId, category, updatedAt)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      category = excluded.category,
      updatedAt = excluded.updatedAt
  `).run(userId, category);
}
