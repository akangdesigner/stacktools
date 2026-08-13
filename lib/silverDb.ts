import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'silver.db'));

// build 階段多個 worker process 會平行 import 這支檔案，全新資料庫時彼此會搶著
// 補欄位，晚到的 ALTER TABLE 撞到已經被別的 worker 補過的欄位會噴
// SQLITE_ERROR duplicate column name，這裡吃掉這種情況、其他錯誤照樣丟出去
function safeAlter(sql: string): void {
  try {
    db.exec(sql);
  } catch (err) {
    if (err instanceof Error && /duplicate column name/i.test(err.message)) return;
    throw err;
  }
}

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
    chronicDiseases TEXT,  -- 逗號分隔的 CHRONIC_DISEASES key，例如 "diabetes,kidney"
    chronicOther TEXT,     -- 慢性病清單外的其他，自由文字
    avoidFoods TEXT,       -- 使用者自訂不能吃/要避免的東西，自由文字
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
    remindTime TEXT NOT NULL DEFAULT '08:00',
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

  CREATE TABLE IF NOT EXISTS bless_preferences (
    userId TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS news_cache (
    userId TEXT PRIMARY KEY,
    date TEXT NOT NULL,           -- 快取日期 YYYY-MM-DD，判斷是不是今天抓的
    newsJson TEXT NOT NULL,       -- 今日抓到的全部新聞（最多 20 則）JSON 陣列
    batchIndex INTEGER DEFAULT 0, -- 長輩目前看到第幾批（0=第一批 1~5 則，1=第二批 6~10 則…）
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS travel_cache (
    userId TEXT PRIMARY KEY,
    date TEXT NOT NULL,           -- 快取日期 YYYY-MM-DD，判斷是不是今天抓的
    travelJson TEXT NOT NULL,     -- 今日抓到的旅遊景點（最多 15 個）JSON 陣列
    batchIndex INTEGER DEFAULT 0, -- 長輩目前看到第幾批（0=第一批 1~3 個，1=第二批 4~6 個…）
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    batchId TEXT NOT NULL,        -- 同一次拍照/描述辨識出的多品項共用同一個值，分組查詢用
    foodName TEXT NOT NULL,
    quantityDesc TEXT,
    grams REAL,
    calories REAL,
    proteinG REAL,
    carbG REAL,
    fatG REAL,
    hasVegetable INTEGER DEFAULT 0,
    nutritionSource TEXT,          -- 'fda'=食藥署資料庫換算／'ai'=AI估算
    sourceName TEXT,                -- 命中的食藥署資料庫食物名稱，AI 估算時為 null
    adviceText TEXT,
    source TEXT DEFAULT 'liff',
    createdAt TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// user_notes 舊資料庫可能還沒有 importance 欄位，補上去
const userNotesColumns = db.prepare("PRAGMA table_info(user_notes)").all() as { name: string }[];
if (!userNotesColumns.some((c) => c.name === 'importance')) {
  safeAlter("ALTER TABLE user_notes ADD COLUMN importance TEXT NOT NULL DEFAULT 'short_term'");
}

// silver_users 舊資料庫可能還沒有 botName / persona 欄位（客戶資料設定新增的），補上去
const silverUserColumns = db.prepare("PRAGMA table_info(silver_users)").all() as { name: string }[];
if (!silverUserColumns.some((c) => c.name === 'botName')) {
  safeAlter('ALTER TABLE silver_users ADD COLUMN botName TEXT');
}
if (!silverUserColumns.some((c) => c.name === 'persona')) {
  safeAlter('ALTER TABLE silver_users ADD COLUMN persona TEXT');
}
// 慢性病／避免食物（飲食拍照分析要用來提醒），舊資料庫可能還沒有這三個欄位，補上去
if (!silverUserColumns.some((c) => c.name === 'chronicDiseases')) {
  safeAlter('ALTER TABLE silver_users ADD COLUMN chronicDiseases TEXT');
}
if (!silverUserColumns.some((c) => c.name === 'chronicOther')) {
  safeAlter('ALTER TABLE silver_users ADD COLUMN chronicOther TEXT');
}
if (!silverUserColumns.some((c) => c.name === 'avoidFoods')) {
  safeAlter('ALTER TABLE silver_users ADD COLUMN avoidFoods TEXT');
}

// recurring_reminders 舊資料庫可能還沒有 remindTime 欄位（原本固定每天 8:30 推播、
// 沒有讓長輩自己選時間），補上去；預設 '08:00' 讓舊資料的行為跟以前最接近
const reminderColumns = db.prepare("PRAGMA table_info(recurring_reminders)").all() as { name: string }[];
if (!reminderColumns.some((c) => c.name === 'remindTime')) {
  safeAlter("ALTER TABLE recurring_reminders ADD COLUMN remindTime TEXT NOT NULL DEFAULT '08:00'");
}

// bless_preferences 第一版存的是語意類別（morning/night/festival/wisdom），
// 上線沒多久就改成整點時段（06/09/12/15/18/21，對應排程 cron 實際觸發的時刻）。
// 舊格式的值跟新的合法時段完全不重疊，parseBlessCategories 會全部濾掉變成
// 空字串，接著被誤判成「使用者自己取消勾選全部」而整個退訂——實際上只是
// 資料格式換了，使用者從沒表達過這個意願。清掉舊格式的列，讓它們退回
// 「沒設定過＝全部時段都要」的預設值，才是這批人真正的原意。
const VALID_BLESS_HOUR_TOKENS = ['06', '09', '12', '15', '18', '21'];
const staleBlessRows = db.prepare('SELECT userId, category FROM bless_preferences').all() as {
  userId: string;
  category: string;
}[];
for (const row of staleBlessRows) {
  const tokens = row.category.split(',').map((s) => s.trim());
  const hasValidToken = tokens.some((t) => VALID_BLESS_HOUR_TOKENS.includes(t));
  if (!hasValidToken) {
    db.prepare('DELETE FROM bless_preferences WHERE userId = ?').run(row.userId);
  }
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

// ── Bless Preferences（長輩圖自動發送要收哪幾個固定時段）───────────────────
// 排程（「銀髮機器人」的「自動長輩圖排程」節點）cron 是 `0 6,9,12,15,18,21 * * *`，
// 一天固定發 6 次，不是每人各自挑任意時間——所以偏好設定是「這 6 個時段裡，
// 哪幾個我要收」，不是隨便選時間。跟 news_preferences 同一套玩法：沒設定過
// （bless_preferences 沒有這個 userId 的資料列）視為「全部時段都要」——這樣
// 舊使用者不會因為這個新功能上線就突然被退訂，行為跟現在完全一樣，除非使用者
// 自己進 LIFF 頁去關掉某個時段。

export const BLESS_CATEGORIES = ['06', '09', '12', '15', '18', '21'] as const;
export type BlessCategory = (typeof BLESS_CATEGORIES)[number];

export const BLESS_CATEGORY_LABELS: Record<BlessCategory, string> = {
  '06': '早上6點',
  '09': '早上9點',
  '12': '中午12點',
  '15': '下午3點',
  '18': '下午6點',
  '21': '晚上9點',
};

export function isValidBlessCategory(value: string): value is BlessCategory {
  return (BLESS_CATEGORIES as readonly string[]).includes(value);
}

function parseBlessCategories(raw: string | null | undefined): BlessCategory[] {
  if (!raw) return [];
  const chosen = new Set(
    raw.split(',').map((s) => s.trim()).filter(isValidBlessCategory),
  );
  return BLESS_CATEGORIES.filter((c) => chosen.has(c));
}

function normalizeBlessCategories(categories: string[]): BlessCategory[] {
  const chosen = new Set(categories.map((s) => s.trim()).filter(isValidBlessCategory));
  return BLESS_CATEGORIES.filter((c) => chosen.has(c));
}

export interface BlessPreference {
  userId: string;
  categories: BlessCategory[];
  updatedAt: string;
}

interface BlessPreferenceRow {
  userId: string;
  category: string;
  updatedAt: string;
}

// 回傳 null 代表這個人沒設定過（=全部類別都要），跟「設定過但全部取消」不一樣
export function getBlessPreference(userId: string): BlessPreference | null {
  const row = db
    .prepare('SELECT * FROM bless_preferences WHERE userId = ?')
    .get(userId) as BlessPreferenceRow | undefined;
  if (!row) return null;
  return { userId: row.userId, categories: parseBlessCategories(row.category), updatedAt: row.updatedAt };
}

export function setBlessPreferenceCategories(userId: string, categories: string[]): BlessCategory[] {
  const clean = normalizeBlessCategories(categories);
  db.prepare(`
    INSERT INTO bless_preferences (userId, category, updatedAt)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      category = excluded.category,
      updatedAt = excluded.updatedAt
  `).run(userId, clean.join(','));
  return clean;
}

// 排程推播長輩圖時用：這個類別要發給誰。沒設定過偏好的人一律算「要」，
// 設定過的人要看清單裡有沒有這個類別。
export function getUsersForBlessCategory(category: BlessCategory): SilverUser[] {
  const users = getAllUsers();
  const prefRows = db.prepare('SELECT userId, category FROM bless_preferences').all() as BlessPreferenceRow[];
  const prefMap = new Map(prefRows.map((r) => [r.userId, parseBlessCategories(r.category)]));
  return users.filter((u) => {
    const chosen = prefMap.get(u.userId);
    return chosen === undefined || chosen.includes(category);
  });
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
  remindTime: string; // "HH:00"，長輩自選整點推播時間，例如 "08:00"
  createdAt: string;
}

export function createRecurringReminder(
  userId: string,
  description: string,
  daysOfWeek: number[],
  remindTime = '08:00',
): number {
  const result = db.prepare(`
    INSERT INTO recurring_reminders (userId, description, daysOfWeek, remindTime)
    VALUES (?, ?, ?, ?)
  `).run(userId, description, daysOfWeek.join(','), remindTime);
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

// 舊版：只看星期幾，不管時間（保留相容；沒人叫這支了但留著無妨）
export function getRecurringRemindersDueToday(): RecurringReminder[] {
  const today = String(new Date().getDay());
  return (db.prepare('SELECT * FROM recurring_reminders').all() as RecurringReminder[])
    .filter((r) => r.daysOfWeek.split(',').includes(today));
}

// 這個時間點（台灣時區的星期幾＋整點）該推的提醒。dayOfWeek: 0=週日～6=週六，hour: 0-23
export function getRecurringRemindersDueAt(dayOfWeek: number, hour: number): RecurringReminder[] {
  const day = String(dayOfWeek);
  const time = `${String(hour).padStart(2, '0')}:00`;
  return (db.prepare('SELECT * FROM recurring_reminders').all() as RecurringReminder[])
    .filter((r) => r.daysOfWeek.split(',').includes(day) && r.remindTime === time);
}

// 台灣時區的「現在」星期幾＋整點，n8n 排程改成每小時跑一次時，/due 用這個算現在該推哪個時段
// （伺服器本身在 UTC，不能直接用 new Date().getDay()/getHours()，踩過同一個坑很多次了）
export function taipeiDayAndHour(): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // hour12:false 的 24 時制在午夜會回 "24"，要當 0 點看
  return { dayOfWeek: weekdayMap[get('weekday')] ?? 0, hour: Number(get('hour')) % 24 };
}

// ── Silver Users ────────────────────────────────────────────────────────────

export interface SilverUser {
  userId: string;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  botName: string | null; // 使用者自訂的機器人名字，例如「小福」
  persona: string | null; // 機器人人設，見 PERSONA_KEYS
  chronicDiseases: string | null; // 逗號分隔的 CHRONIC_DISEASES key
  chronicOther: string | null; // 慢性病清單外的其他，自由文字
  avoidFoods: string | null; // 不能吃/要避免的東西，自由文字
  createdAt: string;
  updatedAt: string;
}

// 機器人人設選項，語氣描述交由呼叫端（ai-linebot lib/persona.ts）決定，
// 這裡只認得合法的 key，避免存進亂七八糟的值
export const PERSONA_KEYS = ['gentle', 'funny', 'boss', 'butler'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];
export function isValidPersona(value: string): value is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(value);
}

// 慢性病固定選項（給飲食拍照分析的 AI 建議用來判斷要不要提醒）。
// 中文標籤交由呼叫端（ai-linebot）自己維護一份對照——跟 PERSONA_KEYS 同一套
// 「兩邊手動同步 key」的做法，這裡只認得合法 key，不管顯示文字。
export const CHRONIC_DISEASES = ['diabetes', 'hypertension', 'kidney', 'gout', 'heart', 'hyperlipidemia'] as const;
export type ChronicDisease = (typeof CHRONIC_DISEASES)[number];
export function isValidChronicDisease(value: string): value is ChronicDisease {
  return (CHRONIC_DISEASES as readonly string[]).includes(value);
}

export function getUser(userId: string): SilverUser | null {
  return (db.prepare('SELECT * FROM silver_users WHERE userId = ?').get(userId) as SilverUser) ?? null;
}

export function getAllUsers(): SilverUser[] {
  return db.prepare('SELECT * FROM silver_users ORDER BY updatedAt DESC').all() as SilverUser[];
}

export interface SilverUserFields {
  nickname: string | null;
  age: number | null;
  gender: string | null;
  botName?: string | null;
  persona?: string | null;
  chronicDiseases?: string | null; // 逗號分隔字串，呼叫端（route.ts）負責驗證/組字串
  chronicOther?: string | null;
  avoidFoods?: string | null;
}

export function upsertUser(userId: string, fields: SilverUserFields): void {
  db.prepare(`
    INSERT INTO silver_users (userId, nickname, age, gender, botName, persona, chronicDiseases, chronicOther, avoidFoods, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, silver_users.nickname),
      age = COALESCE(excluded.age, silver_users.age),
      gender = COALESCE(excluded.gender, silver_users.gender),
      botName = COALESCE(excluded.botName, silver_users.botName),
      persona = COALESCE(excluded.persona, silver_users.persona),
      chronicDiseases = COALESCE(excluded.chronicDiseases, silver_users.chronicDiseases),
      chronicOther = COALESCE(excluded.chronicOther, silver_users.chronicOther),
      avoidFoods = COALESCE(excluded.avoidFoods, silver_users.avoidFoods),
      updatedAt = excluded.updatedAt
  `).run(
    userId,
    fields.nickname,
    fields.age,
    fields.gender,
    fields.botName ?? null,
    fields.persona ?? null,
    fields.chronicDiseases ?? null,
    fields.chronicOther ?? null,
    fields.avoidFoods ?? null,
  );
}

// 編輯用戶基本資料：直接覆蓋（允許清空成 null，跟 upsertUser 的 COALESCE 保留舊值不同）
export function updateUser(userId: string, fields: SilverUserFields): void {
  db.prepare(`
    UPDATE silver_users
    SET nickname = ?, age = ?, gender = ?, botName = ?, persona = ?,
        chronicDiseases = ?, chronicOther = ?, avoidFoods = ?,
        updatedAt = datetime('now', 'localtime')
    WHERE userId = ?
  `).run(
    fields.nickname,
    fields.age,
    fields.gender,
    fields.botName ?? null,
    fields.persona ?? null,
    fields.chronicDiseases ?? null,
    fields.chronicOther ?? null,
    fields.avoidFoods ?? null,
    userId,
  );
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
    db.prepare('DELETE FROM food_logs WHERE userId = ?').run(uid);
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

// 旗標存活時間：超過就視為失效（避免使用者中途離開，卡住之後所有對話）
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 分鐘

export function getPendingAction(userId: string): string | null {
  const row = db.prepare('SELECT pendingAction, updatedAt FROM user_state WHERE userId = ?').get(userId) as
    | { pendingAction: string | null; updatedAt: string | null }
    | undefined;
  if (!row?.pendingAction) return null;
  // 超過 10 分鐘沒動作就自動失效並清掉，讓後續對話回到正常流程
  if (row.updatedAt) {
    const savedAt = new Date(row.updatedAt.replace(' ', 'T')).getTime();
    if (!Number.isNaN(savedAt) && Date.now() - savedAt > PENDING_ACTION_TTL_MS) {
      db.prepare('UPDATE user_state SET pendingAction = NULL WHERE userId = ?').run(userId);
      return null;
    }
  }
  return row.pendingAction;
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

// ── Travel Cache（今日旅遊景點快取＋閱讀進度，支援「3 個一批、按鈕看更多」輪流瀏覽）──

export interface TravelItem {
  name: string;      // 景點名
  summary: string;   // 一段大字簡介
  img: string;       // 代表圖片網址
  transport: string; // 交通/位置（怎麼去、在哪）
  season: string;    // 適合原因/季節（為什麼推薦、適合何時去）
}

export interface TravelCache {
  userId: string;
  date: string;
  travelJson: string;
  batchIndex: number;
  updatedAt: string;
}

// 存入今日旅遊景點（n8n 抓完最多 15 個後呼叫）。同一人同一天覆蓋，並把閱讀進度歸零。
export function saveTravelCache(userId: string, travel: TravelItem[]): void {
  db.prepare(`
    INSERT INTO travel_cache (userId, date, travelJson, batchIndex, updatedAt)
    VALUES (?, date('now', 'localtime'), ?, 0, datetime('now', 'localtime'))
    ON CONFLICT(userId) DO UPDATE SET
      date = date('now', 'localtime'),
      travelJson = excluded.travelJson,
      batchIndex = 0,
      updatedAt = datetime('now', 'localtime')
  `).run(userId, JSON.stringify(travel));
}

// 取出快取原始資料；若不是今天的就視同沒有（回 null）
export function getTravelCache(userId: string): TravelCache | null {
  const row = db
    .prepare("SELECT * FROM travel_cache WHERE userId = ? AND date = date('now', 'localtime')")
    .get(userId) as TravelCache | undefined;
  return row ?? null;
}

// 前進到下一批，回傳新的 batchIndex
export function advanceTravelBatch(userId: string): number {
  db.prepare(`
    UPDATE travel_cache SET batchIndex = batchIndex + 1, updatedAt = datetime('now', 'localtime')
    WHERE userId = ?
  `).run(userId);
  const row = db.prepare('SELECT batchIndex FROM travel_cache WHERE userId = ?').get(userId) as
    | { batchIndex: number }
    | undefined;
  return row?.batchIndex ?? 0;
}

// 從頭再看一次：閱讀進度歸零
export function resetTravelBatch(userId: string): void {
  db.prepare(`
    UPDATE travel_cache SET batchIndex = 0, updatedAt = datetime('now', 'localtime') WHERE userId = ?
  `).run(userId);
}

// ── Food Logs（飲食拍照分析，一次拍照/描述可能對應多列，共用同一個 batchId）────────

export interface FoodLogItemInput {
  foodName: string;
  quantityDesc: string | null;
  grams: number | null;
  calories: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  hasVegetable: boolean;
  nutritionSource: 'fda' | 'ai' | null;
  sourceName: string | null;
}

export interface FoodLog {
  id: number;
  userId: string;
  batchId: string;
  foodName: string;
  quantityDesc: string | null;
  grams: number | null;
  calories: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  hasVegetable: number;
  nutritionSource: string | null;
  sourceName: string | null;
  adviceText: string | null;
  source: string;
  createdAt: string;
}

// 一次拍照/描述辨識出的多品項一起寫入，共用同一個 batchId；用 crypto.randomUUID
// 而不是給呼叫端自己傳，確保每次呼叫都是新的一批（跟 hb_food_logs 的做法一致）
export function createFoodLogBatch(
  userId: string,
  items: FoodLogItemInput[],
  advice: string,
  source = 'liff'
): { batchId: string; items: FoodLog[] } {
  const batchId = crypto.randomUUID();
  const insert = db.prepare(`
    INSERT INTO food_logs
      (userId, batchId, foodName, quantityDesc, grams, calories, proteinG, carbG, fatG, hasVegetable, nutritionSource, sourceName, adviceText, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows: FoodLogItemInput[]) => {
    for (const item of rows) {
      insert.run(
        userId,
        batchId,
        item.foodName,
        item.quantityDesc,
        item.grams,
        item.calories,
        item.proteinG,
        item.carbG,
        item.fatG,
        item.hasVegetable ? 1 : 0,
        item.nutritionSource,
        item.sourceName,
        advice,
        source
      );
    }
  });
  tx(items);
  return { batchId, items: getFoodLogBatch(batchId) };
}

// 同批多列 insert 的 createdAt 時間戳太接近，只排 createdAt 順序會不穩定，
// 這是 health-butler 那邊踩過兩次的坑（見 [[same-insert-timestamp-ordering]]），
// 這裡直接用 id 當 tiebreaker。
export function getFoodLogBatch(batchId: string): FoodLog[] {
  return db.prepare('SELECT * FROM food_logs WHERE batchId = ? ORDER BY id ASC').all(batchId) as FoodLog[];
}

// 該使用者最新一批（LIFF 頁進頁顯示「上次辨識結果」用）
export function getLatestFoodLogBatch(userId: string): FoodLog[] {
  const latest = db.prepare(`
    SELECT batchId FROM food_logs WHERE userId = ? ORDER BY id DESC LIMIT 1
  `).get(userId) as { batchId: string } | undefined;
  if (!latest) return [];
  return getFoodLogBatch(latest.batchId);
}

// 使用者在 LIFF 頁編輯單一品項後儲存（品名/份量改了會由呼叫端重新估算好數字再傳進來）
export function updateFoodLogItem(
  id: number,
  fields: {
    foodName: string;
    quantityDesc: string | null;
    calories: number | null;
    proteinG: number | null;
    carbG: number | null;
    fatG: number | null;
  }
): void {
  db.prepare(`
    UPDATE food_logs SET
      foodName = ?, quantityDesc = ?, calories = ?, proteinG = ?, carbG = ?, fatG = ?
    WHERE id = ?
  `).run(fields.foodName, fields.quantityDesc, fields.calories, fields.proteinG, fields.carbG, fields.fatG, id);
}
