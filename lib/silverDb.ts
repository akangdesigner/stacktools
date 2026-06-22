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

  CREATE TABLE IF NOT EXISTS health_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    resolved INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS silver_users (
    userId TEXT PRIMARY KEY,
    nickname TEXT,
    age INTEGER,
    gender TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_state (
    userId TEXT PRIMARY KEY,
    pendingAction TEXT,
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
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

// ── Health Events ──────────────────────────────────────────────────────────

export interface HealthEvent {
  id: number;
  userId: string;
  type: 'symptom' | 'medication';
  description: string;
  resolved: number;
  createdAt: string;
  updatedAt: string;
}

export function createHealthEvent(userId: string, type: 'symptom' | 'medication', description: string): number {
  const result = db.prepare(`
    INSERT INTO health_events (userId, type, description)
    VALUES (?, ?, ?)
  `).run(userId, type, description);
  return result.lastInsertRowid as number;
}

export function getPendingEvents(): HealthEvent[] {
  return db.prepare('SELECT * FROM health_events WHERE resolved = 0 ORDER BY userId, createdAt').all() as HealthEvent[];
}

export function getUserPendingEvents(userId: string): HealthEvent[] {
  return db.prepare('SELECT * FROM health_events WHERE userId = ? AND resolved = 0').all(userId) as HealthEvent[];
}

export function resolveHealthEvent(id: number): void {
  db.prepare(`
    UPDATE health_events SET resolved = 1, updatedAt = datetime('now', 'localtime') WHERE id = ?
  `).run(id);
}

export function resolveUserHealthEvents(userId: string, type?: 'symptom' | 'medication'): void {
  if (type) {
    db.prepare(`
      UPDATE health_events SET resolved = 1, updatedAt = datetime('now', 'localtime')
      WHERE userId = ? AND type = ? AND resolved = 0
    `).run(userId, type);
    return;
  }
  db.prepare(`
    UPDATE health_events SET resolved = 1, updatedAt = datetime('now', 'localtime')
    WHERE userId = ? AND resolved = 0
  `).run(userId);
}

// ── Silver Users ────────────────────────────────────────────────────────────

export interface SilverUser {
  userId: string;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getUser(userId: string): SilverUser | null {
  return (db.prepare('SELECT * FROM silver_users WHERE userId = ?').get(userId) as SilverUser) ?? null;
}

export function getAllUsers(): SilverUser[] {
  return db.prepare('SELECT * FROM silver_users ORDER BY updatedAt DESC').all() as SilverUser[];
}

export function upsertUser(userId: string, nickname: string | null, age: number | null, gender: string | null): void {
  db.prepare(`
    INSERT INTO silver_users (userId, nickname, age, gender, updatedAt)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, silver_users.nickname),
      age = COALESCE(excluded.age, silver_users.age),
      gender = COALESCE(excluded.gender, silver_users.gender),
      updatedAt = excluded.updatedAt
  `).run(userId, nickname, age, gender);
}

// ── User Notes（聊天中偵測到的額外資訊，多筆累加，不覆蓋既有欄位）────────────

export interface UserNote {
  id: number;
  userId: string;
  category: string;
  content: string;
  createdAt: string;
}

export function createUserNote(userId: string, category: string, content: string): number {
  const result = db.prepare(`
    INSERT INTO user_notes (userId, category, content)
    VALUES (?, ?, ?)
  `).run(userId, category, content);
  return result.lastInsertRowid as number;
}

export function getUserNotes(userId: string): UserNote[] {
  return db.prepare('SELECT * FROM user_notes WHERE userId = ? ORDER BY createdAt DESC').all(userId) as UserNote[];
}

export function getAllUserNotes(): UserNote[] {
  return db.prepare('SELECT * FROM user_notes ORDER BY createdAt DESC').all() as UserNote[];
}

export function deleteUserNote(id: number): void {
  db.prepare('DELETE FROM user_notes WHERE id = ?').run(id);
}

// ── User State（暫存使用者目前的等待動作，例如等待語音做祝福圖）──────────────

export function getPendingAction(userId: string): string | null {
  const row = db.prepare('SELECT pendingAction FROM user_state WHERE userId = ?').get(userId) as
    | { pendingAction: string | null }
    | undefined;
  return row?.pendingAction ?? null;
}

export function setPendingAction(userId: string, action: string | null): void {
  db.prepare(`
    INSERT INTO user_state (userId, pendingAction, updatedAt)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      pendingAction = excluded.pendingAction,
      updatedAt = excluded.updatedAt
  `).run(userId, action);
}
