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

export function resolveUserSymptoms(userId: string): void {
  db.prepare(`
    UPDATE health_events SET resolved = 1, updatedAt = datetime('now', 'localtime')
    WHERE userId = ? AND type = 'symptom' AND resolved = 0
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
      nickname = excluded.nickname,
      age = excluded.age,
      gender = excluded.gender,
      updatedAt = excluded.updatedAt
  `).run(userId, nickname, age, gender);
}
