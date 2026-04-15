import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'social.db');

let db: Database.Database | null = null;

export function getSocialDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS social_clients (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      slack_id   TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS social_client_urls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  TEXT NOT NULL REFERENCES social_clients(id) ON DELETE CASCADE,
      platform   TEXT NOT NULL,
      url        TEXT NOT NULL
    );
  `);

  return db;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SocialClient {
  id: string;
  name: string;
  slack_id: string | null;
  created_at: string;
}

export interface PlatformGroup {
  platform: string;
  urls: string[];
}

// ── Clients ────────────────────────────────────────────────────────────────

export function listClients(): (SocialClient & { url_count: number })[] {
  const db = getSocialDb();
  return db.prepare(`
    SELECT c.*, COUNT(u.id) AS url_count
    FROM social_clients c
    LEFT JOIN social_client_urls u ON u.client_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all() as (SocialClient & { url_count: number })[];
}

export function getClient(id: string): SocialClient | undefined {
  return getSocialDb().prepare('SELECT * FROM social_clients WHERE id = ?').get(id) as SocialClient | undefined;
}

export function createClient({ name, slackId }: { name: string; slackId?: string }): SocialClient {
  const id = crypto.randomUUID();
  getSocialDb().prepare('INSERT INTO social_clients (id, name, slack_id) VALUES (?, ?, ?)').run(id, name, slackId ?? null);
  return getClient(id)!;
}

export function updateClient(id: string, { name, slackId }: { name?: string; slackId?: string }) {
  const db = getSocialDb();
  if (name !== undefined) db.prepare('UPDATE social_clients SET name = ? WHERE id = ?').run(name, id);
  if (slackId !== undefined) db.prepare('UPDATE social_clients SET slack_id = ? WHERE id = ?').run(slackId || null, id);
}

export function deleteClient(id: string) {
  getSocialDb().prepare('DELETE FROM social_clients WHERE id = ?').run(id);
}

// ── URLs ───────────────────────────────────────────────────────────────────

export function getClientUrls(clientId: string): PlatformGroup[] {
  const rows = getSocialDb().prepare(
    'SELECT platform, url FROM social_client_urls WHERE client_id = ? ORDER BY platform, id'
  ).all(clientId) as { platform: string; url: string }[];

  const map = new Map<string, string[]>();
  for (const { platform, url } of rows) {
    if (!map.has(platform)) map.set(platform, []);
    map.get(platform)!.push(url);
  }
  return Array.from(map.entries()).map(([platform, urls]) => ({ platform, urls }));
}

export function setClientUrls(clientId: string, platforms: { platform: string; urls: string[] }[]) {
  const db = getSocialDb();
  const del = db.prepare('DELETE FROM social_client_urls WHERE client_id = ?');
  const ins = db.prepare('INSERT INTO social_client_urls (client_id, platform, url) VALUES (?, ?, ?)');

  db.transaction(() => {
    del.run(clientId);
    for (const { platform, urls } of platforms) {
      for (const url of urls) {
        if (url.trim()) ins.run(clientId, platform, url.trim());
      }
    }
  })();
}
