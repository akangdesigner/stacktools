import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'diary.db');

export interface Progress {
  id: number;
  tool: string;
  feature: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Group {
  id: number;
  name: string;
  created_at: string;
}

export interface Todo {
  id: number;
  group_id: number;
  title: string;
  note: string;
  done: number;
  created_at: string;
  done_at: string | null;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS diary_progress (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tool         TEXT NOT NULL,
      feature      TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT '開發中',
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      updated_at   TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS diary_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS diary_todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id   INTEGER NOT NULL,
      title      TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      done_at    TEXT
    );
  `);
  // 既有資料庫補欄位（CREATE IF NOT EXISTS 不會替舊表加新欄）
  const cols = db.prepare('PRAGMA table_info(diary_progress)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'completed_at')) {
    db.exec('ALTER TABLE diary_progress ADD COLUMN completed_at TEXT');
  }
  // 從「一筆一段功能文字」改為「一筆一個功能」：補 feature 欄，舊 features 整段搬成功能名
  if (!cols.some((c) => c.name === 'feature')) {
    db.exec("ALTER TABLE diary_progress ADD COLUMN feature TEXT NOT NULL DEFAULT ''");
    if (cols.some((c) => c.name === 'features')) {
      db.exec("UPDATE diary_progress SET feature = features WHERE feature = ''");
    }
  }
  return db;
}

/* ---------- 開發進度 ---------- */

export function getProgress(): Progress[] {
  return getDb()
    .prepare('SELECT * FROM diary_progress ORDER BY tool ASC, created_at ASC')
    .all() as Progress[];
}

export function addProgress(tool: string, feature: string, status: string): void {
  getDb()
    .prepare('INSERT INTO diary_progress (tool, feature, status) VALUES (?, ?, ?)')
    .run(tool, feature, status);
}

export function updateProgress(id: number, tool: string, feature: string, status: string): void {
  getDb()
    .prepare(`
      UPDATE diary_progress
      SET tool = ?, feature = ?, status = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `)
    .run(tool, feature, status, id);
}

export function deleteProgress(id: number): void {
  getDb().prepare('DELETE FROM diary_progress WHERE id = ?').run(id);
}

// 打勾完成：自動轉「已上線」並記下完成時間；取消打勾則回「開發中」、清除完成時間
export function toggleProgressDone(id: number, done: boolean): void {
  getDb()
    .prepare(`
      UPDATE diary_progress
      SET status = ?,
          completed_at = ${done ? "datetime('now','localtime')" : 'NULL'},
          updated_at = datetime('now','localtime')
      WHERE id = ?
    `)
    .run(done ? '已上線' : '開發中', id);
}

/* ---------- 待辦分區 ---------- */

export function getGroups(): Group[] {
  return getDb()
    .prepare('SELECT * FROM diary_groups ORDER BY created_at ASC')
    .all() as Group[];
}

export function addGroup(name: string): number {
  const info = getDb().prepare('INSERT INTO diary_groups (name) VALUES (?)').run(name);
  return Number(info.lastInsertRowid);
}

export function renameGroup(id: number, name: string): void {
  getDb().prepare('UPDATE diary_groups SET name = ? WHERE id = ?').run(name, id);
}

export function deleteGroup(id: number): void {
  const d = getDb();
  const tx = d.transaction((gid: number) => {
    d.prepare('DELETE FROM diary_todos WHERE group_id = ?').run(gid);
    d.prepare('DELETE FROM diary_groups WHERE id = ?').run(gid);
  });
  tx(id);
}

/* ---------- 待辦事項 ---------- */

export function getTodos(): Todo[] {
  return getDb()
    .prepare('SELECT * FROM diary_todos ORDER BY created_at ASC')
    .all() as Todo[];
}

export function addTodo(groupId: number, title: string): void {
  getDb()
    .prepare('INSERT INTO diary_todos (group_id, title) VALUES (?, ?)')
    .run(groupId, title);
}

export function toggleTodo(id: number, done: boolean): void {
  getDb()
    .prepare("UPDATE diary_todos SET done = ?, done_at = ? WHERE id = ?")
    .run(done ? 1 : 0, done ? new Date().toISOString() : null, id);
}

export function deleteTodo(id: number): void {
  getDb().prepare('DELETE FROM diary_todos WHERE id = ?').run(id);
}
