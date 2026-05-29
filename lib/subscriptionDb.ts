import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'subscription.db');

let db: Database.Database | null = null;

export function getSubscriptionDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      category          TEXT NOT NULL DEFAULT 'other',
      amount            REAL NOT NULL DEFAULT 0,
      currency          TEXT NOT NULL DEFAULT 'TWD',
      cycle             TEXT NOT NULL DEFAULT 'monthly',
      next_billing_date TEXT,
      status            TEXT NOT NULL DEFAULT 'active',
      note              TEXT,
      account           TEXT,
      password          TEXT,
      payer             TEXT,
      auto_renew        INTEGER NOT NULL DEFAULT 1,
      department        TEXT NOT NULL DEFAULT 'tech',
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 欄位遷移：既有 DB 補欄位
  const cols = db.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[];
  if (!cols.some(c => c.name === 'account')) db.exec('ALTER TABLE subscriptions ADD COLUMN account TEXT');
  if (!cols.some(c => c.name === 'password')) db.exec('ALTER TABLE subscriptions ADD COLUMN password TEXT');
  if (!cols.some(c => c.name === 'payer')) db.exec('ALTER TABLE subscriptions ADD COLUMN payer TEXT');
  if (!cols.some(c => c.name === 'auto_renew')) db.exec('ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 1');
  if (!cols.some(c => c.name === 'department')) db.exec("ALTER TABLE subscriptions ADD COLUMN department TEXT NOT NULL DEFAULT 'tech'");

  return db;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type SubscriptionCategory = 'ai' | 'dev' | 'design' | 'storage' | 'other';
export type SubscriptionCurrency = 'TWD' | 'USD' | 'JPY' | 'EUR';
export type SubscriptionCycle = 'monthly' | 'yearly' | 'onetime';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export type SubscriptionDepartment = 'tech' | 'marketing';

export interface Subscription {
  id: string;
  name: string;
  category: SubscriptionCategory;
  amount: number;
  currency: SubscriptionCurrency;
  cycle: SubscriptionCycle;
  next_billing_date: string | null;
  status: SubscriptionStatus;
  note: string | null;
  account: string | null;
  password: string | null;
  payer: string | null;
  auto_renew: number; // 1=是, 0=否
  department: SubscriptionDepartment;
  created_at: string;
  updated_at: string;
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export function listSubscriptions(status?: SubscriptionStatus): Subscription[] {
  const db = getSubscriptionDb();
  if (status) {
    return db.prepare('SELECT * FROM subscriptions WHERE status = ? ORDER BY next_billing_date ASC, name ASC')
      .all(status) as Subscription[];
  }
  return db.prepare('SELECT * FROM subscriptions ORDER BY next_billing_date ASC, name ASC')
    .all() as Subscription[];
}

export function getSubscription(id: string): Subscription | undefined {
  return getSubscriptionDb()
    .prepare('SELECT * FROM subscriptions WHERE id = ?')
    .get(id) as Subscription | undefined;
}

export interface CreateSubscriptionInput {
  name: string;
  category: SubscriptionCategory;
  amount: number;
  currency: SubscriptionCurrency;
  cycle: SubscriptionCycle;
  next_billing_date?: string;
  status?: SubscriptionStatus;
  note?: string;
  account?: string;
  password?: string;
  payer?: string;
  auto_renew?: number;
  department?: SubscriptionDepartment;
}

export function createSubscription(input: CreateSubscriptionInput): Subscription {
  const id = crypto.randomUUID();
  getSubscriptionDb().prepare(`
    INSERT INTO subscriptions (id, name, category, amount, currency, cycle, next_billing_date, status, note, account, password, payer, auto_renew, department)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.category,
    input.amount,
    input.currency,
    input.cycle,
    input.next_billing_date ?? null,
    input.status ?? 'active',
    input.note ?? null,
    input.account ?? null,
    input.password ?? null,
    input.payer ?? null,
    input.auto_renew ?? 1,
    input.department ?? 'tech',
  );
  return getSubscription(id)!;
}

export interface UpdateSubscriptionInput {
  name?: string;
  category?: SubscriptionCategory;
  amount?: number;
  currency?: SubscriptionCurrency;
  cycle?: SubscriptionCycle;
  next_billing_date?: string | null;
  status?: SubscriptionStatus;
  note?: string | null;
  account?: string | null;
  password?: string | null;
  payer?: string | null;
  auto_renew?: number;
  department?: SubscriptionDepartment;
}

export function updateSubscription(id: string, input: UpdateSubscriptionInput): void {
  const db = getSubscriptionDb();
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace('T', ' ');
  const cols: string[] = [];
  const vals: unknown[] = [];

  function set(col: string, val: unknown) { cols.push(`${col} = ?`); vals.push(val); }

  if (input.name !== undefined) set('name', input.name);
  if (input.category !== undefined) set('category', input.category);
  if (input.amount !== undefined) set('amount', input.amount);
  if (input.currency !== undefined) set('currency', input.currency);
  if (input.cycle !== undefined) set('cycle', input.cycle);
  if (input.next_billing_date !== undefined) set('next_billing_date', input.next_billing_date);
  if (input.status !== undefined) set('status', input.status);
  if (input.note !== undefined) set('note', input.note);
  if (input.account !== undefined) set('account', input.account);
  if (input.password !== undefined) set('password', input.password);
  if (input.payer !== undefined) set('payer', input.payer);
  if (input.auto_renew !== undefined) set('auto_renew', input.auto_renew);
  if (input.department !== undefined) set('department', input.department);

  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  vals.push(now, id);
  db.prepare(`UPDATE subscriptions SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteSubscription(id: string): void {
  getSubscriptionDb().prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
}
