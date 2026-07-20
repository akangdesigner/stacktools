import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (_db) return _db;
  const DATA_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, 'gsc.db'));
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ai_editor_clients (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      social_account TEXT NOT NULL DEFAULT '',
      line_uid       TEXT NOT NULL DEFAULT ''
    );
  `);

  const cols = (_db.prepare(`PRAGMA table_info(ai_editor_clients)`).all() as { name: string }[]).map(c => c.name);
  if (cols.includes('site_url')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN site_url`);
  }
  if (cols.includes('buffer_code')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN buffer_code`);
  }
  if (!cols.includes('keywords')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN keywords TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('persona')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN persona TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('client_info')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN client_info TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('recent_activities')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN recent_activities TEXT NOT NULL DEFAULT ''`);
  }
  if (cols.includes('buffer_ig')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN buffer_ig`);
  }
  if (cols.includes('buffer_thread')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN buffer_thread`);
  }
  if (cols.includes('buffer_fb')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN buffer_fb`);
  }
  if (!cols.includes('fb_group_url')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN fb_group_url TEXT NOT NULL DEFAULT ''`);
  }
  if (cols.includes('ig_user_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN ig_user_id`);
  }
  if (cols.includes('threads_user_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients DROP COLUMN threads_user_id`);
  }
  if (!cols.includes('fb_page_id')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN fb_page_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('meta_access_token')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN meta_access_token TEXT NOT NULL DEFAULT ''`);
  }
  if (!cols.includes('threads_access_token')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN threads_access_token TEXT NOT NULL DEFAULT ''`);
  }
  // IG 專用 Token：沒有 FB 粉專的客戶走 Instagram Login API（graph.instagram.com），60 天有效可 refresh
  if (!cols.includes('ig_access_token')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN ig_access_token TEXT NOT NULL DEFAULT ''`);
  }
  // 圖片風格偏好（代碼，如 cinematic/anime/retro/watercolor/claymation/object-hero）：空字串＝未指定，維持預設真實生活感
  if (!cols.includes('image_style')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN image_style TEXT NOT NULL DEFAULT ''`);
  }

  // 社群帳號密碼：改用真欄位取代 social_account 塞單一字串猜格式（舊資料留在 social_account 當備份）
  for (const col of ['fb_user', 'fb_pass', 'th_user', 'th_pass', 'ig_user', 'ig_pass']) {
    if (!cols.includes(col)) {
      _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }

  // ── 金流（綠界信用卡定期定額 / 自動扣款）欄位 ──
  // 扣款狀態：none=未設定, pending=已產生連結待授權, active=授權成功扣款中, failed=扣款失敗, cancelled=已取消
  if (!cols.includes('billing_status')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'none'`);
  }
  // 月費金額（元），預設 3000
  if (!cols.includes('billing_amount')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN billing_amount INTEGER NOT NULL DEFAULT 3000`);
  }
  // 綠界交易編號（首次授權時的 MerchantTradeNo），用來對應回呼
  if (!cols.includes('ecpay_trade_no')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN ecpay_trade_no TEXT NOT NULL DEFAULT ''`);
  }
  // 信用卡末四碼（綠界回呼提供，僅供辨識）
  if (!cols.includes('card_last4')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN card_last4 TEXT NOT NULL DEFAULT ''`);
  }
  // 下次預定扣款日（綠界回呼提供）
  if (!cols.includes('next_charge_date')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN next_charge_date TEXT NOT NULL DEFAULT ''`);
  }
  // 最近一次成功扣款時間
  if (!cols.includes('last_charge_at')) {
    _db.exec(`ALTER TABLE ai_editor_clients ADD COLUMN last_charge_at TEXT NOT NULL DEFAULT ''`);
  }

  return _db;
}

export interface AiEditorClient {
  id: number;
  name: string;
  social_account: string;  // 舊格式備份用，新資料一律讀寫下面 6 個真欄位
  fb_user: string;
  fb_pass: string;
  th_user: string;
  th_pass: string;
  ig_user: string;
  ig_pass: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
  recent_activities: string;
  fb_group_url: string;
  fb_page_id: string;
  meta_access_token: string;
  threads_access_token: string;
  ig_access_token: string;  // 無 FB 客戶專用（Instagram Login API）
  image_style: string;  // 圖片風格偏好代碼，空字串＝未指定
  // 金流欄位
  billing_status: 'none' | 'pending' | 'active' | 'failed' | 'cancelled';
  billing_amount: number;
  ecpay_trade_no: string;
  card_last4: string;
  next_charge_date: string;
  last_charge_at: string;
}

export function listAiEditorClients(): AiEditorClient[] {
  return getDb().prepare('SELECT * FROM ai_editor_clients ORDER BY id').all() as AiEditorClient[];
}

export function getAiEditorClient(id: number): AiEditorClient | null {
  return getDb().prepare('SELECT * FROM ai_editor_clients WHERE id = ?').get(id) as AiEditorClient | null;
}

// 建立客戶時不需帶金流欄位與 ig_access_token（由 DB 預設值填入、之後另外登記）
type NewAiEditorClient = Omit<AiEditorClient, 'id' | 'ig_access_token' | 'billing_status' | 'billing_amount' | 'ecpay_trade_no' | 'card_last4' | 'next_charge_date' | 'last_charge_at'>;

export function createAiEditorClient(data: NewAiEditorClient): AiEditorClient {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO ai_editor_clients (name, social_account, fb_user, fb_pass, th_user, th_pass, ig_user, ig_pass, line_uid, keywords, persona, client_info, recent_activities, fb_group_url, fb_page_id, meta_access_token, threads_access_token, image_style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.social_account ?? '', data.fb_user ?? '', data.fb_pass ?? '', data.th_user ?? '', data.th_pass ?? '', data.ig_user ?? '', data.ig_pass ?? '', data.line_uid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.fb_group_url ?? '', data.fb_page_id ?? '', data.meta_access_token ?? '', data.threads_access_token ?? '', data.image_style ?? '');
  return getAiEditorClient(result.lastInsertRowid as number)!;
}

export function updateAiEditorClient(id: number, data: Partial<Omit<AiEditorClient, 'id'>>): void {
  const db = getDb();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE id = ?`).run(...values, id);
}

export function deleteAiEditorClient(id: number): void {
  getDb().prepare('DELETE FROM ai_editor_clients WHERE id = ?').run(id);
}

// ── 金流相關 ──

// 只更新金流欄位（供產生連結、綠界回呼時使用）
export function updateClientBilling(
  id: number,
  data: Partial<Pick<AiEditorClient, 'billing_status' | 'billing_amount' | 'ecpay_trade_no' | 'card_last4' | 'next_charge_date' | 'last_charge_at'>>
): void {
  const keys = Object.keys(data);
  if (keys.length === 0) return;
  const db = getDb();
  const fields = keys.map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE id = ?`).run(...values, id);
}

// 用綠界交易編號反查客戶（回呼對應用；理論上 CustomField1 已帶 id，這支為備援）
export function getClientByTradeNo(tradeNo: string): AiEditorClient | null {
  return getDb().prepare('SELECT * FROM ai_editor_clients WHERE ecpay_trade_no = ?').get(tradeNo) as AiEditorClient | null;
}

// 用 LINE UID 查客戶（LINE 圖文選單流程用：客戶在 LINE 點按鈕，帶的是 userId=line_uid）
export function getClientByLineUid(lineUid: string): AiEditorClient | null {
  return getDb().prepare('SELECT * FROM ai_editor_clients WHERE line_uid = ?').get(lineUid) as AiEditorClient | null;
}

export function upsertClientByLineUid(
  lineUid: string,
  data: Partial<Omit<AiEditorClient, 'id' | 'line_uid'>>
): { client: AiEditorClient; action: 'created' | 'updated' } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM ai_editor_clients WHERE line_uid = ?').get(lineUid) as AiEditorClient | undefined;
  if (existing) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    if (fields) db.prepare(`UPDATE ai_editor_clients SET ${fields} WHERE line_uid = ?`).run(...values, lineUid);
    return { client: getAiEditorClient(existing.id)!, action: 'updated' };
  }
  const result = db.prepare(
    'INSERT INTO ai_editor_clients (name, social_account, fb_user, fb_pass, th_user, th_pass, ig_user, ig_pass, line_uid, keywords, persona, client_info, recent_activities, fb_group_url, fb_page_id, meta_access_token, threads_access_token, image_style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.name ?? '', data.social_account ?? '', data.fb_user ?? '', data.fb_pass ?? '', data.th_user ?? '', data.th_pass ?? '', data.ig_user ?? '', data.ig_pass ?? '', lineUid, data.keywords ?? '', data.persona ?? '', data.client_info ?? '', data.recent_activities ?? '', data.fb_group_url ?? '', data.fb_page_id ?? '', data.meta_access_token ?? '', data.threads_access_token ?? '', data.image_style ?? '');
  return { client: getAiEditorClient(result.lastInsertRowid as number)!, action: 'created' };
}
