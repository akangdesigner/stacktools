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
      social_account TEXT NOT NULL DEFAULT '',
      line_uid       TEXT NOT NULL DEFAULT ''
    );
  `);

  const cols = (_db.prepare(`PRAGMA table_info(ai_editor_clients)`).all() as { name: string }[]).map(c => c.name);
  if (cols.includes('site_url')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN site_url`);
  }
  if (cols.includes('buffer_code')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN buffer_code`);
  }
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
  if (!cols.includes('buffer_ig')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN buffer_ig TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('buffer_thread')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN buffer_thread TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('buffer_fb')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN buffer_fb TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('fb_group_url')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN fb_group_url TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('ig_user_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN ig_user_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('fb_page_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN fb_page_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('threads_user_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN threads_user_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('meta_access_token')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN meta_access_token TEXT NOT NULL DEFAULT ''`);
  }

  return _db;
}

export interface AiEditorClient {
  id: number;
  name: string;
  social_account: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
  recent_activities: string;
  buffer_ig: string;
  buffer_thread: string;
  buffer_fb: string;
  fb_group_url: string;
  ig_user_id: string;
  fb_page_id: string;
  threads_user_id: string;
  meta_access_token: string;
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
    'INSERT INTO ai_editor_clients (name, social_account, line_uid, keywords, persona, client_info, recent_activities, buffer_ig, buffer_thread, buffer_fb, fb_group_url, ig_user_id, fb_page_id, threads_user_id, meta_access_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.social_account, data.line_uid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.buffer_ig ?? '', data.buffer_thread ?? '', data.buffer_fb ?? '', data.fb_group_url ?? '', data.ig_user_id ?? '', data.fb_page_id ?? '', data.threads_user_id ?? '', data.meta_access_token ?? '');
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
    'INSERT INTO ai_editor_clients (name, social_account, line_uid, keywords, persona, client_info, recent_activities, buffer_ig, buffer_thread, buffer_fb, fb_group_url, ig_user_id, fb_page_id, threads_user_id, meta_access_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name ?? '', data.social_account ?? '', lineUid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.buffer_ig ?? '', data.buffer_thread ?? '', data.buffer_fb ?? '', data.fb_group_url ?? '', data.ig_user_id ?? '', data.fb_page_id ?? '', data.threads_user_id ?? '', data.meta_access_token ?? '');
  return { client: getAiEditorClient(result.lastInsertRowid as number)!, action: 'created' };
}
