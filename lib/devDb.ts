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

export interface CurrentTask {
  id: number; person: string; title: string; content: string; note: string; created_at: string;
}
export interface CompletedTask {
  id: number; person: string; title: string; content: string; note: string; completed_at: string; created_at: string;
}

export function getCurrentTasks(): CurrentTask[] {
  return db.prepare('SELECT * FROM dev_current_tasks ORDER BY person, created_at DESC').all() as CurrentTask[];
}

export function getCompletedTasks(): CompletedTask[] {
  return db.prepare('SELECT * FROM dev_completed_tasks ORDER BY completed_at DESC').all() as CompletedTask[];
}

export function addTask(person: string, title: string, content: string, note: string) {
  db.prepare('INSERT INTO dev_current_tasks (person, title, content, note) VALUES (?, ?, ?, ?)').run(person, title, content, note);
}

export function completeTask(id: number): boolean {
  const task = db.prepare('SELECT * FROM dev_current_tasks WHERE id = ?').get(id) as CurrentTask | undefined;
  if (!task) return false;
  db.prepare('INSERT INTO dev_completed_tasks (person, title, content, note, created_at) VALUES (?, ?, ?, ?, ?)').run(task.person, task.title, task.content, task.note, task.created_at);
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
