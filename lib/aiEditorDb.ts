import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gsc.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_editor_clients (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    site_url       TEXT NOT NULL,
    social_account TEXT NOT NULL DEFAULT '',
    line_uid       TEXT NOT NULL DEFAULT ''
  );
`);

// 自動遷移
const cols = (db.prepare(`PRAGMA table_info(ai_editor_clients)`).all() as { name: string }[]).map(c => c.name);
if (!cols.includes('keywords')) {
  db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN keywords TEXT NOT NULL DEFAULT ''`);
}
if (!cols.includes('persona')) {
  db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN persona TEXT NOT NULL DEFAULT ''`);
}
if (!cols.includes('client_info')) {
  db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN client_info TEXT NOT NULL DEFAULT ''`);
}
if (!cols.includes('recent_activities')) {
  db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN recent_activities TEXT NOT NULL DEFAULT ''`);
}

export interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
  recent_activities: string;
}

export function listAiEditorClients(): AiEditorClient[] {
  return db.prepare('SELECT * FROM ai_editor_clients ORDER BY id').all() as AiEditorClient[];
}

export function getAiEditorClient(id: number): AiEditorClient | null {
  return db.prepare('SELECT * FROM ai_editor_clients WHERE id = ?').get(id) as AiEditorClient | null;
}

export function createAiEditorClient(data: Omit<AiEditorClient, 'id'>): AiEditorClient {
  const result = db.prepare(
    'INSERT INTO ai_editor_clients (name, site_url, social_account, line_uid, keywords, persona, client_info, recent_activities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.site_url, data.social_account, data.line_uid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '');
  return getAiEditorClient(result.lastInsertRowid as number)!;
}

export function updateAiEditorClient(id: number, data: Partial<Omit<AiEditorClient, 'id'>>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE id = ?`).run(...values, id);
}

export function deleteAiEditorClient(id: number): void {
  db.prepare('DELETE FROM ai_editor_clients WHERE id = ?').run(id);
}

export function upsertClientByLineUid(
  lineUid: string, name: string, siteUrl: string, socialAccount: string
): { client: AiEditorClient; action: 'created' | 'updated' } {
  const existing = db.prepare('SELECT * FROM ai_editor_clients WHERE line_uid = ?').get(lineUid) as AiEditorClient | undefined;
  if (existing) {
    db.prepare('UPDATE ai_editor_clients SET name = ?, site_url = ?, social_account = ? WHERE line_uid = ?').run(name, siteUrl, socialAccount, lineUid);
    return { client: getAiEditorClient(existing.id)!, action: 'updated' };
  }
  const result = db.prepare('INSERT INTO ai_editor_clients (name, site_url, social_account, line_uid) VALUES (?, ?, ?, ?)').run(name, siteUrl, socialAccount, lineUid);
  return { client: getAiEditorClient(result.lastInsertRowid as number)!, action: 'created' };
}
