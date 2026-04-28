import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (_db) return _db;
  const DATA_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, 'gsc.db'));
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ai_editor_clients (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      site_url       TEXT NOT NULL,
      social_account TEXT NOT NULL DEFAULT '',
      line_uid       TEXT NOT NULL DEFAULT ''
    );
  `);

  const cols = (_db.prepare(`PRAGMA table_info(ai_editor_clients)`).all() as { name: string }[]).map(c => c.name);
  if (!cols.includes('keywords')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN keywords TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('persona')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN persona TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('client_info')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN client_info TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('recent_activities')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN recent_activities TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('buffer_code')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN buffer_code TEXT NOT NULL DEFAULT ''`);
  }

  return _db;
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
  buffer_code: string;
}

export function listAiEditorClients(): AiEditorClient[] {
  return getDb().prepare('SELECT * FROM ai_editor_clients ORDER BY id').all() as AiEditorClient[];
}

export function getAiEditorClient(id: number): AiEditorClient | null {
  return getDb().prepare('SELECT * FROM ai_editor_clients WHERE id = ?').get(id) as AiEditorClient | null;
}

export function createAiEditorClient(data: Omit<AiEditorClient, 'id'>): AiEditorClient {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO ai_editor_clients (name, site_url, social_account, line_uid, keywords, persona, client_info, recent_activities, buffer_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.site_url, data.social_account, data.line_uid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.buffer_code ?? '');
  return getAiEditorClient(result.lastInsertRowid as number)!;
}

export function updateAiEditorClient(id: number, data: Partial<Omit<AiEditorClient, 'id'>>): void {
  const db = getDb();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE id = ?`).run(...values, id);
}

export function deleteAiEditorClient(id: number): void {
  getDb().prepare('DELETE FROM ai_editor_clients WHERE id = ?').run(id);
}

export function upsertClientByLineUid(
  lineUid: string,
  data: Partial<Omit<AiEditorClient, 'id' | 'line_uid'>>
): { client: AiEditorClient; action: 'created' | 'updated' } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM ai_editor_clients WHERE line_uid = ?').get(lineUid) as AiEditorClient | undefined;
  if (existing) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    if (fields) db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE line_uid = ?`).run(...values, lineUid);
    return { client: getAiEditorClient(existing.id)!, action: 'updated' };
  }
  const result = db.prepare(
    'INSERT INTO ai_editor_clients (name, site_url, social_account, line_uid, keywords, persona, client_info, recent_activities, buffer_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name ?? '', data.site_url ?? '', data.social_account ?? '', lineUid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.buffer_code ?? '');
  return { client: getAiEditorClient(result.lastInsertRowid as number)!, action: 'created' };
}
