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
    importance TEXT NOT NULL DEFAULT 'short_term',
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS user_state (
    userId TEXT PRIMARY KEY,
    pendingAction TEXT,
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS recurring_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    description TEXT NOT NULL,
    daysOfWeek TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS auto_bless_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    slot TEXT NOT NULL,
    theme TEXT NOT NULL,
    content TEXT NOT NULL,
    driveFileId TEXT,
    customizeUsed INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(userId, slot)
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflowName TEXT,
    nodeName TEXT,
    message TEXT,
    executionUrl TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS family_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    ingredients TEXT,
    steps TEXT,
    tips TEXT,
    driveFileId TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS news_cache (
    userId TEXT PRIMARY KEY,
    date TEXT NOT NULL,           -- 快取日期 YYYY-MM-DD，判斷是不是今天抓的
    newsJson TEXT NOT NULL,       -- 今日抓到的全部新聞（最多 20 則）JSON 陣列
    batchIndex INTEGER DEFAULT 0, -- 長輩目前看到第幾批（0=第一批 1~5 則，1=第二批 6~10 則…）
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// user_notes 舊資料庫可能還沒有 importance 欄位，補上去
const userNotesColumns = db.prepare("PRAGMA table_info(user_notes)").all() as { name: string }[];
if (!userNotesColumns.some((c) => c.name === 'importance')) {
  db.exec("ALTER TABLE user_notes ADD COLUMN importance TEXT NOT NULL DEFAULT 'short_term'");
}

const SHORT_TERM_NOTE_LIMIT = 20;

// 固定的新聞類別清單（長輩可從這裡複選；順序就是選單顯示順序）
export const NEWS_CATEGORIES = [
  '健康醫療',
  '財經理財',
  '社會生活',
  '政治國際',
  '娛樂體育',
  '旅遊美食',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

// 是不是合法類別（擋掉 n8n 傳進來的錯字或舊資料殘留）
export function isValidNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

// DB 存的是逗號字串，這裡轉成乾淨的陣列：去空白、過濾非法、去重複、維持清單順序
function parseCategories(raw: string | null | undefined): NewsCategory[] {
  if (!raw) return [];
  const chosen = new Set(
    raw.split(',').map((s) => s.trim()).filter(isValidNewsCategory),
  );
  return NEWS_CATEGORIES.filter((c) => chosen.has(c));
}

// 把傳進來的陣列整理成合法、去重、照清單順序排好的結果
function normalizeCategories(categories: string[]): NewsCategory[] {
  const chosen = new Set(categories.map((s) => s.trim()).filter(isValidNewsCategory));
  return NEWS_CATEGORIES.filter((c) => chosen.has(c));
}

export interface NewsPreference {
  userId: string;
  categories: NewsCategory[];
  updatedAt: string;
}

interface NewsPreferenceRow {
  userId: string;
  category: string;
  updatedAt: string;
}

export function getPreference(userId: string): NewsPreference | null {
  const row = db
    .prepare('SELECT * FROM news_preferences WHERE userId = ?')
    .get(userId) as NewsPreferenceRow | undefined;
  if (!row) return null;
  return { userId: row.userId, categories: parseCategories(row.category), updatedAt: row.updatedAt };
}

export function getAllPreferences(): NewsPreference[] {
  const rows = db.prepare('SELECT * FROM news_preferences').all() as NewsPreferenceRow[];
  return rows.map((row) => ({
    userId: row.userId,
    categories: parseCategories(row.category),
    updatedAt: row.updatedAt,
  }));
}

// 整批覆蓋使用者的訂閱類別（n8n 傳一組勾選結果進來），回傳整理後實際存下的類別
export function setPreferenceCategories(userId: string, categories: string[]): NewsCategory[] {
  const clean = normalizeCategories(categories);
  db.prepare(`
    INSERT INTO news_preferences (userId, category, updatedAt)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      category = excluded.category,
      updatedAt = excluded.updatedAt
  `).run(userId, clean.join(','));
  return clean;
}

// 單一類別切換：原本有就拿掉、沒有就加上（長輩在對話中點一下類別用），回傳切換後的清單
export function toggleNewsCategory(
  userId: string,
  category: string,
  action: 'toggle' | 'add' | 'remove' = 'toggle',
): NewsCategory[] {
  if (!isValidNewsCategory(category)) return getPreference(userId)?.categories ?? [];
  const current = getPreference(userId)?.categories ?? [];
  const has = current.includes(category);
  const shouldHave = action === 'add' ? true : action === 'remove' ? false : !has;
  const next = shouldHave ? [...current, category] : current.filter((c) => c !== category);
  return setPreferenceCategories(userId, next);
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

// ── Recurring Reminders ────────────────────────────────────────────────────

export interface RecurringReminder {
  id: number;
  userId: string;
  description: string;
  daysOfWeek: string; // 逗號分隔，0=週日～6=週六，例如 "1,4"
  createdAt: string;
}

export function createRecurringReminder(userId: string, description: string, daysOfWeek: number[]): number {
  const result = db.prepare(`
    INSERT INTO recurring_reminders (userId, description, daysOfWeek)
    VALUES (?, ?, ?)
  `).run(userId, description, daysOfWeek.join(','));
  return result.lastInsertRowid as number;
}

export function getUserRecurringReminders(userId: string): RecurringReminder[] {
  return db.prepare('SELECT * FROM recurring_reminders WHERE userId = ?').all(userId) as RecurringReminder[];
}

export function deleteRecurringReminder(id: number): void {
  db.prepare('DELETE FROM recurring_reminders WHERE id = ?').run(id);
}

export function getAllRecurringReminders(): RecurringReminder[] {
  return db.prepare('SELECT * FROM recurring_reminders').all() as RecurringReminder[];
}

export function getRecurringRemindersDueToday(): RecurringReminder[] {
  const today = String(new Date().getDay());
  return (db.prepare('SELECT * FROM recurring_reminders').all() as RecurringReminder[])
    .filter((r) => r.daysOfWeek.split(',').includes(today));
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

// 編輯用戶基本資料：直接覆蓋（允許清空成 null，跟 upsertUser 的 COALESCE 保留舊值不同）
export function updateUser(userId: string, nickname: string | null, age: number | null, gender: string | null): void {
  db.prepare(`
    UPDATE silver_users
    SET nickname = ?, age = ?, gender = ?, updatedAt = datetime('now', 'localtime')
    WHERE userId = ?
  `).run(nickname, age, gender, userId);
}

// 刪除用戶，連同該用戶所有關聯資料一起清掉，避免留下孤兒資料
export function deleteUser(userId: string): void {
  const tx = db.transaction((uid: string) => {
    db.prepare('DELETE FROM user_notes WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM health_events WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM recurring_reminders WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM user_state WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM news_preferences WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM auto_bless_sends WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM family_recipes WHERE userId = ?').run(uid);
    db.prepare('DELETE FROM silver_users WHERE userId = ?').run(uid);
  });
  tx(userId);
}

// ── User Notes（聊天中偵測到的額外資訊，多筆累加，不覆蓋既有欄位）────────────

export interface UserNote {
  id: number;
  userId: string;
  category: string;
  content: string;
  importance: 'long_term' | 'short_term';
  createdAt: string;
}

export function createUserNote(
  userId: string,
  category: string,
  content: string,
  importance: 'long_term' | 'short_term' = 'short_term'
): number {
  const result = db.prepare(`
    INSERT INTO user_notes (userId, category, content, importance)
    VALUES (?, ?, ?, ?)
  `).run(userId, category, content, importance);

  if (importance === 'short_term') {
    const excess = db.prepare(`
      SELECT id FROM user_notes
      WHERE userId = ? AND importance = 'short_term'
      ORDER BY createdAt DESC
      LIMIT -1 OFFSET ?
    `).all(userId, SHORT_TERM_NOTE_LIMIT) as { id: number }[];
    if (excess.length > 0) {
      const ids = excess.map((row) => row.id);
      db.prepare(`DELETE FROM user_notes WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  }

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

// ── Auto Bless Sends（每三小時主動推播長輩圖）──────────────────────────────

export interface AutoBlessSend {
  id: number;
  userId: string;
  slot: string; // 'YYYY-MM-DD_HH'，防止同時段重複發送
  theme: string;
  content: string;
  driveFileId: string | null;
  customizeUsed: number;
  createdAt: string;
  updatedAt: string;
}

export function createAutoBlessSend(
  userId: string,
  slot: string,
  theme: string,
  content: string
): { id: number; alreadySent: boolean } {
  const existing = db.prepare('SELECT id FROM auto_bless_sends WHERE userId = ? AND slot = ?').get(userId, slot) as
    | { id: number }
    | undefined;
  if (existing) return { id: existing.id, alreadySent: true };

  try {
    const result = db.prepare(`
      INSERT INTO auto_bless_sends (userId, slot, theme, content)
      VALUES (?, ?, ?, ?)
    `).run(userId, slot, theme, content);
    return { id: result.lastInsertRowid as number, alreadySent: false };
  } catch (e) {
    const row = db.prepare('SELECT id FROM auto_bless_sends WHERE userId = ? AND slot = ?').get(userId, slot) as { id: number };
    return { id: row.id, alreadySent: true };
  }
}

export function setAutoBlessSendDriveFile(id: number, driveFileId: string): void {
  db.prepare(`
    UPDATE auto_bless_sends SET driveFileId = ?, updatedAt = datetime('now', 'localtime') WHERE id = ?
  `).run(driveFileId, id);
}

export function getActiveAutoBlessSend(userId: string): AutoBlessSend | null {
  return (db.prepare(`
    SELECT * FROM auto_bless_sends WHERE userId = ? AND customizeUsed = 0 ORDER BY createdAt DESC LIMIT 1
  `).get(userId) as AutoBlessSend) ?? null;
}

export function getAutoBlessSendById(id: number): AutoBlessSend | null {
  return (db.prepare('SELECT * FROM auto_bless_sends WHERE id = ?').get(id) as AutoBlessSend) ?? null;
}

export function markAutoBlessCustomizeUsed(id: number): void {
  db.prepare(`
    UPDATE auto_bless_sends SET customizeUsed = 1, updatedAt = datetime('now', 'localtime') WHERE id = ?
  `).run(id);
}

export function getUsersDueForAutoBless(slot: string): SilverUser[] {
  return db.prepare(`
    SELECT * FROM silver_users
    WHERE userId NOT IN (
      SELECT userId FROM auto_bless_sends WHERE slot = ?
    )
  `).all(slot) as SilverUser[];
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

export interface ErrorLog {
  id: number;
  workflowName: string | null;
  nodeName: string | null;
  message: string | null;
  executionUrl: string | null;
  createdAt: string;
}

export function createErrorLog(
  workflowName: string | null,
  nodeName: string | null,
  message: string | null,
  executionUrl: string | null
): number {
  const info = db
    .prepare('INSERT INTO error_logs (workflowName, nodeName, message, executionUrl) VALUES (?, ?, ?, ?)')
    .run(workflowName, nodeName, message, executionUrl);
  return info.lastInsertRowid as number;
}

export function getErrorLogs(limit = 100): ErrorLog[] {
  return db.prepare('SELECT * FROM error_logs ORDER BY id DESC LIMIT ?').all(limit) as ErrorLog[];
}

export function deleteErrorLog(id: number): void {
  db.prepare('DELETE FROM error_logs WHERE id = ?').run(id);
}

// ── Family Recipes（家傳食譜卡，長輩口述記錄自家私房菜，可保存傳承）────────────

export interface FamilyRecipe {
  id: number;
  userId: string;
  name: string; // 菜名，例如「阿嬤滷肉」
  ingredients: string | null; // 食材，口述整段文字
  steps: string | null; // 做法步驟，口述整段文字
  tips: string | null; // 家傳撇步，傳承精華
  driveFileId: string | null; // 生成的食譜卡圖，存 Google Drive
  createdAt: string;
  updatedAt: string;
}

export function createFamilyRecipe(
  userId: string,
  name: string,
  ingredients: string | null = null,
  steps: string | null = null,
  tips: string | null = null
): number {
  const result = db.prepare(`
    INSERT INTO family_recipes (userId, name, ingredients, steps, tips)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, name, ingredients, steps, tips);
  return result.lastInsertRowid as number;
}

export function getUserFamilyRecipes(userId: string): FamilyRecipe[] {
  return db.prepare('SELECT * FROM family_recipes WHERE userId = ? ORDER BY createdAt DESC').all(userId) as FamilyRecipe[];
}

export function getFamilyRecipeById(id: number): FamilyRecipe | null {
  return (db.prepare('SELECT * FROM family_recipes WHERE id = ?').get(id) as FamilyRecipe) ?? null;
}

// 局部更新：長輩語音分次口述，只蓋有傳入的欄位，沒講到的不動（COALESCE）
export function updateFamilyRecipe(
  id: number,
  fields: { name?: string; ingredients?: string; steps?: string; tips?: string }
): void {
  db.prepare(`
    UPDATE family_recipes SET
      name = COALESCE(?, name),
      ingredients = COALESCE(?, ingredients),
      steps = COALESCE(?, steps),
      tips = COALESCE(?, tips),
      updatedAt = datetime('now', 'localtime')
    WHERE id = ?
  `).run(fields.name ?? null, fields.ingredients ?? null, fields.steps ?? null, fields.tips ?? null, id);
}

export function setFamilyRecipeDriveFile(id: number, driveFileId: string): void {
  db.prepare(`
    UPDATE family_recipes SET driveFileId = ?, updatedAt = datetime('now', 'localtime') WHERE id = ?
  `).run(driveFileId, id);
}

export function deleteFamilyRecipe(id: number): void {
  db.prepare('DELETE FROM family_recipes WHERE id = ?').run(id);
}

// ── News Cache（今日新聞快取＋閱讀進度，支援「5 則一批、按鈕看更多」輪流瀏覽）──────

export interface NewsItem {
  title: string;
  summary: string;
  img: string;
}

export interface NewsCache {
  userId: string;
  date: string;
  newsJson: string;
  batchIndex: number;
  updatedAt: string;
}

// 存入今日新聞（n8n 抓完最多 20 則後呼叫）。同一人同一天覆蓋，並把閱讀進度歸零。
export function saveNewsCache(userId: string, news: NewsItem[]): void {
  db.prepare(`
    INSERT INTO news_cache (userId, date, newsJson, batchIndex, updatedAt)
    VALUES (?, date('now', 'localtime'), ?, 0, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      date = date('now', 'localtime'),
      newsJson = excluded.newsJson,
      batchIndex = 0,
      updatedAt = datetime('now', 'localtime')
  `).run(userId, JSON.stringify(news));
}

// 取出快取原始資料；若不是今天的就視同沒有（回 null）
export function getNewsCache(userId: string): NewsCache | null {
  const row = db
    .prepare("SELECT * FROM news_cache WHERE userId = ? AND date = date('now', 'localtime')")
    .get(userId) as NewsCache | undefined;
  return row ?? null;
}

// 前進到下一批，回傳新的 batchIndex
export function advanceNewsBatch(userId: string): number {
  db.prepare(`
    UPDATE news_cache SET batchIndex = batchIndex + 1, updatedAt = datetime('now', 'localtime')
    WHERE userId = ?
  `).run(userId);
  const row = db.prepare('SELECT batchIndex FROM news_cache WHERE userId = ?').get(userId) as
    | { batchIndex: number }
    | undefined;
  return row?.batchIndex ?? 0;
}

// 從頭再看一次：閱讀進度歸零
export function resetNewsBatch(userId: string): void {
  db.prepare(`
    UPDATE news_cache SET batchIndex = 0, updatedAt = datetime('now', 'localtime') WHERE userId = ?
  `).run(userId);
}
