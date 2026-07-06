import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'dev.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS dev_current_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS dev_completed_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    completed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    created_at TEXT NOT NULL
  );
`);

try { db.exec(`ALTER TABLE dev_current_tasks ADD COLUMN content TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE dev_completed_tasks ADD COLUMN content TEXT NOT NULL DEFAULT ''`); } catch {}
// 日程安排欄位：預計開始日／預計完成日（YYYY-MM-DD，空字串代表未排程）
try { db.exec(`ALTER TABLE dev_current_tasks ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE dev_current_tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE dev_completed_tasks ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE dev_completed_tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''`); } catch {}
// 任務來源 key：從「客戶進度追蹤」撈來的事件（客戶名|類型|日期|期數），手動建立的任務為空字串
try { db.exec(`ALTER TABLE dev_current_tasks ADD COLUMN source_key TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE dev_completed_tasks ADD COLUMN source_key TEXT NOT NULL DEFAULT ''`); } catch {}

export interface CurrentTask {
  id: number; person: string; title: string; content: string; note: string;
  start_date: string; due_date: string; source_key: string; created_at: string;
}
export interface CompletedTask {
  id: number; person: string; title: string; content: string; note: string;
  start_date: string; due_date: string; source_key: string; completed_at: string; created_at: string;
}

export function getCurrentTasks(): CurrentTask[] {
  return db.prepare('SELECT * FROM dev_current_tasks ORDER BY person, created_at DESC').all() as CurrentTask[];
}

export function getCompletedTasks(): CompletedTask[] {
  return db.prepare('SELECT * FROM dev_completed_tasks ORDER BY completed_at DESC').all() as CompletedTask[];
}

export function addTask(person: string, title: string, content: string, note: string, startDate = '', dueDate = '', sourceKey = '') {
  db.prepare('INSERT INTO dev_current_tasks (person, title, content, note, start_date, due_date, source_key) VALUES (?, ?, ?, ?, ?, ?, ?)').run(person, title, content, note, startDate, dueDate, sourceKey);
}

// 把客戶進度追蹤的事件指派給多位成員（每人各建一筆任務）；已指派過的成員跳過不重複建
export function assignTask(persons: string[], title: string, content: string, dueDate: string, sourceKey: string) {
  const existing = new Set(
    (db.prepare('SELECT person FROM dev_current_tasks WHERE source_key = ? UNION SELECT person FROM dev_completed_tasks WHERE source_key = ?')
      .all(sourceKey, sourceKey) as { person: string }[]).map(r => r.person)
  );
  for (const person of persons) {
    if (existing.has(person)) continue;
    addTask(person, title, content, '', '', dueDate, sourceKey);
  }
}

// 更新進行中任務（含日程日期）
export function updateCurrentTask(id: number, title: string, content: string, note: string, startDate: string, dueDate: string) {
  db.prepare(
    'UPDATE dev_current_tasks SET title = ?, content = ?, note = ?, start_date = ?, due_date = ? WHERE id = ?'
  ).run(title, content, note, startDate, dueDate, id);
}

export function completeTask(id: number): boolean {
  const task = db.prepare('SELECT * FROM dev_current_tasks WHERE id = ?').get(id) as CurrentTask | undefined;
  if (!task) return false;
  db.prepare('INSERT INTO dev_completed_tasks (person, title, content, note, start_date, due_date, source_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(task.person, task.title, task.content, task.note, task.start_date, task.due_date, task.source_key, task.created_at);
  db.prepare('DELETE FROM dev_current_tasks WHERE id = ?').run(id);
  return true;
}

export function deleteCurrentTask(id: number) {
  db.prepare('DELETE FROM dev_current_tasks WHERE id = ?').run(id);
}

export function deleteCompletedTask(id: number) {
  db.prepare('DELETE FROM dev_completed_tasks WHERE id = ?').run(id);
}

export function updateCompletedTask(id: number, title: string, content: string, note: string, completedAt: string) {
  db.prepare(
    'UPDATE dev_completed_tasks SET title = ?, content = ?, note = ?, completed_at = ? WHERE id = ?'
  ).run(title, content, note, completedAt, id);
}
