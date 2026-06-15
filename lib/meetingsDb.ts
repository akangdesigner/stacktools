import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'dev.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    attendees TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

export interface Meeting {
  id: number;
  title: string;
  date: string;
  attendees: string[];
  content: string;
  created_at: string;
}

export function getMeetings(): Meeting[] {
  const rows = db.prepare('SELECT * FROM meetings ORDER BY date DESC, id DESC').all() as (Omit<Meeting, 'attendees'> & { attendees: string })[];
  return rows.map(r => ({ ...r, attendees: JSON.parse(r.attendees) }));
}

export function createMeeting(title: string, date: string, attendees: string[], content: string): number {
  const result = db.prepare('INSERT INTO meetings (title, date, attendees, content) VALUES (?, ?, ?, ?)').run(title, date, JSON.stringify(attendees), content);
  return result.lastInsertRowid as number;
}

export function getMeeting(id: number): Meeting | null {
  const row = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as (Omit<Meeting, 'attendees'> & { attendees: string }) | undefined;
  if (!row) return null;
  return { ...row, attendees: JSON.parse(row.attendees) };
}

export function updateMeeting(id: number, title: string, date: string, attendees: string[], content: string) {
  db.prepare('UPDATE meetings SET title = ?, date = ?, attendees = ?, content = ? WHERE id = ?').run(title, date, JSON.stringify(attendees), content, id);
}

export function deleteMeeting(id: number) {
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
}
