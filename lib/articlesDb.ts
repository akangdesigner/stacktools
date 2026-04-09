import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'articles.db');

let db: Database.Database | null = null;

export function getArticlesDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL,
      summary      TEXT,
      sender       TEXT,
      source_url   TEXT UNIQUE,
      published_at TEXT,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // 舊資料庫遷移：補上 source_url UNIQUE index（若尚未存在）
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='articles' AND name='idx_articles_source_url'").get();
  if (!indexes) {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_source_url ON articles(source_url) WHERE source_url IS NOT NULL');
  }

  // 舊資料庫遷移：補上新欄位
  const cols = db.pragma('table_info(articles)') as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('summary')) db.exec('ALTER TABLE articles ADD COLUMN summary TEXT');
  if (!colNames.includes('sender'))  db.exec('ALTER TABLE articles ADD COLUMN sender TEXT');

  return db;
}
