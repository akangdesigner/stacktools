import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'blog-gen.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS blog_gen_clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    word_url        TEXT NOT NULL DEFAULT '',
    gdrive_url      TEXT NOT NULL DEFAULT '',
    persona         TEXT NOT NULL DEFAULT '',
    wp_url          TEXT NOT NULL DEFAULT '',
    wp_username     TEXT NOT NULL DEFAULT '',
    wp_app_password TEXT NOT NULL DEFAULT '',
    wp_category_id  TEXT NOT NULL DEFAULT '',
    job_id          TEXT NOT NULL DEFAULT '',
    job_status      TEXT NOT NULL DEFAULT '',
    job_result      TEXT NOT NULL DEFAULT '',
    job_updated     TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 舊資料庫自動補欄位
const existingCols = (db.prepare("PRAGMA table_info(blog_gen_clients)").all() as { name: string }[]).map(c => c.name);
for (const col of ['wp_url', 'wp_username', 'wp_app_password', 'wp_category_id']) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE blog_gen_clients ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  }
}

export interface BlogGenClient {
  id: number;
  name: string;
  word_url: string;
  gdrive_url: string;
  persona: string;
  wp_url: string;
  wp_username: string;
  wp_app_password: string;
  wp_category_id: string;
  job_id: string;
  job_status: string;
  job_result: string;
  job_updated: string;
  created_at: string;
}

export function listClients(): BlogGenClient[] {
  return db.prepare('SELECT * FROM blog_gen_clients ORDER BY id').all() as BlogGenClient[];
}

export function getClient(id: number): BlogGenClient | undefined {
  return db.prepare('SELECT * FROM blog_gen_clients WHERE id = ?').get(id) as BlogGenClient | undefined;
}

export function getClientByJobId(jobId: string): BlogGenClient | undefined {
  return db.prepare('SELECT * FROM blog_gen_clients WHERE job_id = ?').get(jobId) as BlogGenClient | undefined;
}

export function createClient(name: string): BlogGenClient {
  const result = db.prepare('INSERT INTO blog_gen_clients (name) VALUES (?)').run(name);
  return getClient(result.lastInsertRowid as number)!;
}

export function updateClient(
  id: number,
  name: string,
  word_url: string,
  gdrive_url: string,
  persona: string,
  wp_url: string,
  wp_username: string,
  wp_app_password: string,
  wp_category_id: string,
): void {
  db.prepare('UPDATE blog_gen_clients SET name = ?, word_url = ?, gdrive_url = ?, persona = ?, wp_url = ?, wp_username = ?, wp_app_password = ?, wp_category_id = ? WHERE id = ?')
    .run(name, word_url, gdrive_url, persona, wp_url, wp_username, wp_app_password, wp_category_id, id);
}

export function deleteClient(id: number): void {
  db.prepare('DELETE FROM blog_gen_clients WHERE id = ?').run(id);
}

export function setJobProcessing(id: number, jobId: string): void {
  db.prepare('UPDATE blog_gen_clients SET job_id = ?, job_status = ?, job_result = ?, job_updated = datetime(\'now\') WHERE id = ?')
    .run(jobId, 'processing', '', id);
}

export function setJobResult(jobId: string, status: string, result: string): void {
  db.prepare('UPDATE blog_gen_clients SET job_status = ?, job_result = ?, job_updated = datetime(\'now\') WHERE job_id = ?')
    .run(status, result, jobId);
}

export function resetJob(id: number): void {
  db.prepare("UPDATE blog_gen_clients SET job_id = '', job_status = '', job_result = '', job_updated = '' WHERE id = ?")
    .run(id);
}
