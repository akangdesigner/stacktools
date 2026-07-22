// 綠界 ECPay 金流工具（信用卡定期定額 / 自動扣款）
// 這支檔案只負責：組參數、產生簽章(CheckMacValue)、驗證回呼簽章。
// 不碰資料庫、不碰前台，可獨立測試。

import crypto from 'crypto';

// ── 環境設定 ─────────────────────────────────────────────
// ECPAY_ENV=production 時走正式金流，其餘（含未設定）一律走測試環境。
const IS_PROD = ['production', 'prod'].includes((process.env.ECPAY_ENV || '').toLowerCase());

// 沒填自己的 key 時，預設用「綠界官方公開測試特店」——刷假卡、不會真的扣錢。
// 上線時在 .env 填入正式的 ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV 即可，程式不用改。
const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '2000132';
const HASH_KEY = process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9';
const HASH_IV = process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS';

// 綠界結帳(AIO)網址：測試站 vs 正式站
export const AIO_CHECKOUT_URL = IS_PROD
  ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
  : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

export const ECPAY_IS_PROD = IS_PROD;

// 每月月費（元）——目前所有客戶固定 3000
export const MONTHLY_FEE = 3000;

// ── 簽章：CheckMacValue ──────────────────────────────────
// 綠界規則：參數依 key 字母排序 → 前後夾 HashKey / HashIV → .NET 風格 URL encode 轉小寫 → SHA256 → 轉大寫

// 模擬 .NET HttpUtility.UrlEncode 的編碼結果（綠界簽章要求）
function dotNetUrlEncode(raw: string): string {
  return encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+') // 空白 → +
    .replace(/%21/g, '!')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2a/g, '*')
    .replace(/%2d/g, '-')
    .replace(/%2e/g, '.')
    .replace(/%5f/g, '_')
    .replace(/'/g, '%27') // 單引號 → %27（對齊綠界官方 SDK）
    .replace(/~/g, '%7e'); // 波浪號 → %7e
}

// 依綠界規則計算 CheckMacValue（傳入的 params 不應包含 CheckMacValue 本身）
export function generateCheckMacValue(params: Record<string, string>): string {
  // 1. 依 key 英文字母 A→Z 排序（不分大小寫）
  const sortedKeys = Object.keys(params).sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0
  );
  // 2. 前後夾 HashKey / HashIV
  let raw = `HashKey=${HASH_KEY}`;
  for (const key of sortedKeys) raw += `&${key}=${params[key]}`;
  raw += `&HashIV=${HASH_IV}`;
  // 3. URL encode + 轉小寫
  const encoded = dotNetUrlEncode(raw);
  // 4. SHA256 → 5. 轉大寫
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

// 驗證綠界回呼的簽章是否正確（回呼 body 會帶 CheckMacValue，要拿掉它再重算比對）
export function verifyCheckMacValue(params: Record<string, string>): boolean {
  const received = params.CheckMacValue;
  if (!received) return false;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'CheckMacValue') continue;
    rest[k] = v;
  }
  return generateCheckMacValue(rest) === received.toUpperCase();
}

// ── 定期定額結帳參數 ─────────────────────────────────────

// 綠界交易編號：需唯一、≤20 碼、只能英數。用 AIE + 客戶id + 時間戳(36進位)
export function generateMerchantTradeNo(clientId: number): string {
  const stamp = Date.now().toString(36); // 時間戳轉 36 進位縮短長度
  return `AIE${clientId}T${stamp}`.slice(0, 20);
}

// 綠界要求的時間格式：yyyy/MM/dd HH:mm:ss（台灣時間）
function formatEcpayDate(d: Date): string {
  // 轉成台灣時區(UTC+8)，避免 Zeabur 伺服器用 UTC 導致時間不對
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}/${p(tw.getUTCMonth() + 1)}/${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}`;
}

// 定期定額訂單查詢網址：測試站 vs 正式站
export const PERIOD_QUERY_URL = IS_PROD
  ? 'https://payment.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo'
  : 'https://payment-stage.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo';

export interface PeriodInfo {
  RtnCode?: number;
  card4no?: string;        // 卡號末四碼
  card6no?: string;        // 卡號前六碼
  TotalSuccessTimes?: number;
  process_date?: string;
  [k: string]: unknown;
}

// 查詢定期定額訂單資訊。
// 綠界「首次授權」回呼不一定帶卡號末四碼，需要時用這支主動查（回傳含 card4no）。
export async function queryPeriodInfo(merchantTradeNo: string): Promise<PeriodInfo | null> {
  const params: Record<string, string> = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = generateCheckMacValue(params);
  try {
    const res = await fetch(PERIOD_QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) return null;
    return (await res.json()) as PeriodInfo;
  } catch {
    return null;
  }
}

// 回呼時記錄用：現在的台灣時間字串 yyyy-MM-dd HH:mm:ss
export function twNow(): string {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}`;
}

// 估算下次扣款日（台灣時間，往後推 n 個月）yyyy-MM-dd
// 綠界回呼未直接提供下次扣款日，這裡以「本次 + 週期」估算供前端顯示參考
export function twDatePlusMonths(months: number): string {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
  tw.setUTCMonth(tw.getUTCMonth() + months);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())}`;
}

export interface PeriodCheckoutInput {
  clientId: number;      // ai_editor_clients 的 id，回呼時用來對應是哪個客戶
  clientName: string;    // 客戶名稱，顯示在綠界付款頁
  baseUrl: string;       // 你的公開網址（例：https://stacktools.zeabur.app），用來組回呼網址
  amount?: number;       // 月費，預設 MONTHLY_FEE(3000)
  merchantTradeNo?: string; // 可自帶交易編號，不帶則自動產生
}

// 產生「信用卡定期定額」結帳所需的完整參數（含 CheckMacValue）。
// 回傳 { action, params }：前端／API 用 action 當表單 action、params 當隱藏欄位 POST 給綠界即可。
export function buildPeriodCheckoutParams(input: PeriodCheckoutInput): {
  action: string;
  params: Record<string, string>;
  merchantTradeNo: string;
} {
  const amount = input.amount ?? MONTHLY_FEE;
  const tradeNo = input.merchantTradeNo ?? generateMerchantTradeNo(input.clientId);
  const base = input.baseUrl.replace(/\/$/, ''); // 去掉結尾斜線

  const params: Record<string, string> = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: formatEcpayDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: String(amount),
    TradeDesc: 'AI 小編服務月費',
    ItemName: `AI 小編自動發文服務（${input.clientName}）`,
    ReturnURL: `${base}/api/ai-editor/billing/callback`,       // 首次授權結果（server 對 server）
    ChoosePayment: 'Credit',
    EncryptType: '1', // 1 = SHA256

    // ── 定期定額專用欄位 ──
    PeriodAmount: String(amount), // 每期金額（需等於 TotalAmount）
    PeriodType: 'M',              // 週期單位：M=月
    Frequency: '1',               // 每 1 個月扣一次
    ExecTimes: '99',              // 月扣最多 99 期（綠界上限），近到期前需重新授權續約
    PeriodReturnURL: `${base}/api/ai-editor/billing/period-callback`, // 每期自動扣款結果

    OrderResultURL: `${base}/api/ai-editor/billing/result`, // 付款完成後用戶瀏覽器導回頁
    CustomField1: String(input.clientId), // 自訂欄位：帶回客戶 id，回呼時方便對應
  };

  params.CheckMacValue = generateCheckMacValue(params);
  return { action: AIO_CHECKOUT_URL, params, merchantTradeNo: tradeNo };
}

// ── 新版加密 API：信用卡定期定額訂單作業（停用委託）──────────────
// 「停用定期定額後續交易」只有綠界新版加密 API 提供，跟上方舊版 CheckMacValue 機制完全不同：
// 端點是 ecpayment(.stage).ecpay.com.tw/1.0.0/...，請求／回應的 Data 欄位都要 AES-128-CBC 加解密。
// 參考：https://developers.ecpay.com.tw/?p=12136

// 定期定額訂單作業端點：測試站 vs 正式站
export const PERIOD_ACTION_URL = IS_PROD
  ? 'https://ecpayment.ecpay.com.tw/1.0.0/Cashier/CreditCardPeriodAction'
  : 'https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/CreditCardPeriodAction';

// PHP urlencode 相容編碼（綠界 SDK 用）：空白→+，並額外編碼 !'()*，其餘同 encodeURIComponent
function phpUrlEncode(raw: string): string {
  return encodeURIComponent(raw)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function phpUrlDecode(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, '%20'));
}

// 綠界新版加密：JSON 物件 → urlencode → AES-128-CBC(PKCS7) → hex 小寫
function ecpayAesEncrypt(dataObj: Record<string, unknown>): string {
  const encoded = phpUrlEncode(JSON.stringify(dataObj));
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(HASH_KEY, 'utf8'), Buffer.from(HASH_IV, 'utf8'));
  cipher.setAutoPadding(true); // PKCS7
  return Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]).toString('hex');
}
// 綠界新版解密：hex → AES 解密 → urldecode → JSON 物件
function ecpayAesDecrypt(hex: string): Record<string, unknown> | null {
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(HASH_KEY, 'utf8'), Buffer.from(HASH_IV, 'utf8'));
    decipher.setAutoPadding(true);
    const dec = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]).toString('utf8');
    return JSON.parse(phpUrlDecode(dec));
  } catch {
    return null;
  }
}

export interface PeriodActionResult {
  RtnCode?: number;   // 1 = 成功
  RtnMsg?: string;
  MerchantTradeNo?: string;
  [k: string]: unknown;
}

// 停用（取消）某筆定期定額委託。merchantTradeNo = 當初建立時的 ecpay_trade_no。
// 回傳綠界解密後的結果物件（RtnCode=1 代表停用成功）；連線／解密失敗回 null。
export async function cancelPeriod(merchantTradeNo: string): Promise<PeriodActionResult | null> {
  const data = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    Action: 'Cancel', // 停用定期定額後續交易
  };
  const body = {
    MerchantID: MERCHANT_ID,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) }, // Unix 秒，綠界驗證窗 10 分鐘
    Data: ecpayAesEncrypt(data),
  };
  try {
    const res = await fetch(PERIOD_ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { Data?: string; TransCode?: number; TransMsg?: string };
    // 外層 TransCode 只代表「傳輸」成功，實際業務結果在加密的 Data 裡
    if (!json.Data) return { RtnCode: 0, RtnMsg: json.TransMsg || '綠界未回傳 Data' };
    const decoded = ecpayAesDecrypt(json.Data);
    return (decoded as PeriodActionResult) ?? null;
  } catch {
    return null;
  }
}
