import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'finance.db');

let db: Database.Database | null = null;

export function getFinanceDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      tax_id        TEXT NOT NULL,
      contact_name  TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id                    TEXT PRIMARY KEY,
      client_id             TEXT REFERENCES clients(id),
      client_contract_id    TEXT,
      client_name           TEXT NOT NULL,
      tax_id                TEXT NOT NULL,
      reminder_month        INTEGER,
      invoice_number        TEXT,
      invoice_items         TEXT NOT NULL DEFAULT '[]',
      unit_price            REAL NOT NULL DEFAULT 0,
      quantity              INTEGER NOT NULL DEFAULT 1,
      discount              REAL NOT NULL DEFAULT 0,
      tax_inclusive_amount  REAL NOT NULL DEFAULT 0,
      invoice_date          TEXT NOT NULL,
      due_date              TEXT NOT NULL,
      payment_account_last5 TEXT,
      paid_date             TEXT,
      status                TEXT NOT NULL DEFAULT 'pending',
      reminded_5day         INTEGER NOT NULL DEFAULT 0,
      reminded_2day         INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT DEFAULT (datetime('now','localtime')),
      updated_at            TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 既存 DB に client_id 列がなければ追加（マイグレーション）
  const cols = db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'client_id')) {
    db.exec('ALTER TABLE invoices ADD COLUMN client_id TEXT');
  }

  return db;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'voided';

export interface Invoice {
  id: string;
  client_id: string | null;
  client_contract_id: string | null;
  client_name: string;
  tax_id: string;
  reminder_month: number | null;
  invoice_number: string | null;
  invoice_items: string;
  unit_price: number;
  quantity: number;
  discount: number;
  tax_inclusive_amount: number;
  invoice_date: string;
  due_date: string;
  payment_account_last5: string | null;
  paid_date: string | null;
  status: InvoiceStatus;
  reminded_5day: number;
  reminded_2day: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithItems extends Omit<Invoice, 'invoice_items'> {
  invoice_items: InvoiceItem[];
}

function parseItems(inv: Invoice): InvoiceWithItems {
  return {
    ...inv,
    invoice_items: JSON.parse(inv.invoice_items || '[]'),
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export function listInvoices(): InvoiceWithItems[] {
  const rows = getFinanceDb()
    .prepare('SELECT * FROM invoices ORDER BY created_at DESC')
    .all() as Invoice[];
  return rows.map(parseItems);
}

export function getInvoice(id: string): InvoiceWithItems | undefined {
  const row = getFinanceDb()
    .prepare('SELECT * FROM invoices WHERE id = ?')
    .get(id) as Invoice | undefined;
  return row ? parseItems(row) : undefined;
}

export interface CreateInvoiceInput {
  client_id?: string;
  client_contract_id?: string;
  client_name: string;
  tax_id: string;
  reminder_month?: number;
  invoice_number?: string;
  invoice_items: InvoiceItem[];
  unit_price: number;
  quantity: number;
  discount: number;
  tax_inclusive_amount: number;
  invoice_date: string;
  due_date: string;
}

export function createInvoice(input: CreateInvoiceInput): InvoiceWithItems {
  const id = crypto.randomUUID();
  getFinanceDb().prepare(`
    INSERT INTO invoices (
      id, client_id, client_contract_id, client_name, tax_id, reminder_month,
      invoice_number, invoice_items, unit_price, quantity, discount,
      tax_inclusive_amount, invoice_date, due_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.client_id ?? null,
    input.client_contract_id ?? null,
    input.client_name,
    input.tax_id,
    input.reminder_month ?? null,
    input.invoice_number ?? null,
    JSON.stringify(input.invoice_items),
    input.unit_price,
    input.quantity,
    input.discount,
    input.tax_inclusive_amount,
    input.invoice_date,
    input.due_date,
  );
  return getInvoice(id)!;
}

export interface UpdateInvoiceInput {
  client_name?: string;
  tax_id?: string;
  invoice_items?: InvoiceItem[];
  unit_price?: number;
  discount?: number;
  tax_inclusive_amount?: number;
  invoice_date?: string;
  due_date?: string;
  invoice_number?: string;
  payment_account_last5?: string;
  paid_date?: string;
  status?: InvoiceStatus;
  reminded_5day?: number;
  reminded_2day?: number;
}

export function updateInvoice(id: string, input: UpdateInvoiceInput): void {
  const db = getFinanceDb();
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace('T', ' ');
  const cols: string[] = [];
  const vals: unknown[] = [];

  function set(col: string, val: unknown) { cols.push(`${col} = ?`); vals.push(val); }

  if (input.client_name !== undefined) set('client_name', input.client_name);
  if (input.tax_id !== undefined) set('tax_id', input.tax_id);
  if (input.invoice_items !== undefined) set('invoice_items', JSON.stringify(input.invoice_items));
  if (input.unit_price !== undefined) set('unit_price', input.unit_price);
  if (input.discount !== undefined) set('discount', input.discount);
  if (input.tax_inclusive_amount !== undefined) set('tax_inclusive_amount', input.tax_inclusive_amount);
  if (input.invoice_date !== undefined) set('invoice_date', input.invoice_date);
  if (input.due_date !== undefined) set('due_date', input.due_date);
  if (input.invoice_number !== undefined) set('invoice_number', input.invoice_number);
  if (input.payment_account_last5 !== undefined) set('payment_account_last5', input.payment_account_last5);
  if (input.paid_date !== undefined) set('paid_date', input.paid_date);
  if (input.status !== undefined) set('status', input.status);
  if (input.reminded_5day !== undefined) set('reminded_5day', input.reminded_5day);
  if (input.reminded_2day !== undefined) set('reminded_2day', input.reminded_2day);

  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  vals.push(now, id);
  db.prepare(`UPDATE invoices SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteInvoice(id: string): void {
  getFinanceDb().prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

// ── Clients ────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  tax_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWithStats extends Client {
  invoice_count: number;
  outstanding_amount: number;
  last_invoice_date: string | null;
}

export interface CreateClientInput {
  name: string;
  tax_id: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
}

export interface UpdateClientInput {
  name?: string;
  tax_id?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
}

export function listClients(): Client[] {
  return getFinanceDb()
    .prepare('SELECT * FROM clients ORDER BY name ASC')
    .all() as Client[];
}

export function listClientsWithStats(): ClientWithStats[] {
  const rows = getFinanceDb().prepare(`
    SELECT
      c.*,
      COUNT(i.id) AS invoice_count,
      COALESCE(SUM(CASE WHEN i.status IN ('pending','overdue') THEN i.tax_inclusive_amount ELSE 0 END), 0) AS outstanding_amount,
      MAX(i.invoice_date) AS last_invoice_date
    FROM clients c
    LEFT JOIN invoices i ON i.client_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all() as ClientWithStats[];
  return rows;
}

export function getClient(id: string): Client | undefined {
  return getFinanceDb()
    .prepare('SELECT * FROM clients WHERE id = ?')
    .get(id) as Client | undefined;
}

export function createClient(input: CreateClientInput): Client {
  const id = crypto.randomUUID();
  getFinanceDb().prepare(`
    INSERT INTO clients (id, name, tax_id, contact_name, contact_email, contact_phone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.tax_id,
    input.contact_name ?? null,
    input.contact_email ?? null,
    input.contact_phone ?? null,
    input.notes ?? null,
  );
  return getClient(id)!;
}

export function updateClient(id: string, input: UpdateClientInput): void {
  const db = getFinanceDb();
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace('T', ' ');
  const cols: string[] = [];
  const vals: unknown[] = [];

  function set(col: string, val: unknown) { cols.push(`${col} = ?`); vals.push(val); }

  if (input.name !== undefined) set('name', input.name);
  if (input.tax_id !== undefined) set('tax_id', input.tax_id);
  if (input.contact_name !== undefined) set('contact_name', input.contact_name);
  if (input.contact_email !== undefined) set('contact_email', input.contact_email);
  if (input.contact_phone !== undefined) set('contact_phone', input.contact_phone);
  if (input.notes !== undefined) set('notes', input.notes);

  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  vals.push(now, id);
  db.prepare(`UPDATE clients SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteClient(id: string): void {
  getFinanceDb().prepare('DELETE FROM clients WHERE id = ?').run(id);
}

export function listInvoicesByClientId(clientId: string): InvoiceWithItems[] {
  const rows = getFinanceDb()
    .prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC')
    .all(clientId) as Invoice[];
  return rows.map(parseItems);
}

// ── 提醒查詢（供 n8n 呼叫）─────────────────────────────────────────────────

export function getPendingReminders(type: '5day' | '2day' | 'overdue'): InvoiceWithItems[] {
  const db = getFinanceDb();
  const today = new Date().toISOString().slice(0, 10);
  let rows: Invoice[];

  if (type === '5day') {
    const target = new Date();
    target.setDate(target.getDate() + 5);
    const targetDate = target.toISOString().slice(0, 10);
    rows = db.prepare(`
      SELECT * FROM invoices
      WHERE status = 'pending'
        AND due_date = ?
        AND reminded_5day = 0
    `).all(targetDate) as Invoice[];
  } else if (type === '2day') {
    const target = new Date();
    target.setDate(target.getDate() + 2);
    const targetDate = target.toISOString().slice(0, 10);
    rows = db.prepare(`
      SELECT * FROM invoices
      WHERE status = 'pending'
        AND due_date = ?
        AND reminded_2day = 0
    `).all(targetDate) as Invoice[];
  } else {
    rows = db.prepare(`
      SELECT * FROM invoices
      WHERE status = 'pending'
        AND due_date < ?
    `).all(today) as Invoice[];
  }

  return rows.map(parseItems);
}

// 每天自動將逾期發票狀態改為 overdue
export function syncOverdueStatus(): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = getFinanceDb().prepare(`
    UPDATE invoices SET status = 'overdue', updated_at = datetime('now','localtime')
    WHERE status = 'pending' AND due_date < ?
  `).run(today);
  return result.changes;
}
