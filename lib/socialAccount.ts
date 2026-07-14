// social_account 資料庫仍是單一自由文字欄位，這裡把 FB/Threads/IG 帳號密碼序列化成
// 「FB：帳號 x，密碼 y；Threads：...」的固定格式存進去，讀取時再盡量解析回三個欄位；
// 解析不出來（例如舊資料是聊天貼上的自由格式）就整段原文顯示，不會憑空清空。
// 共用給 LIFF 客戶資料設定頁與內部管理頁（/ai-editor/[id]），避免兩邊格式對不上。

// 舊資料格式五花八門（半形/全形冒號、帳號密碼分行、空格分隔、甚至完全沒有標籤），
// 不用固定分隔符切段，改成「找平台關鍵字出現的位置」切段——每個平台關鍵字到下一個
// 平台關鍵字（或字串結尾）之間的整段文字都算它的，帳號/密碼不管在同一行還是換行都能對到。
const PLATFORM_RE = /(Facebook|Threads|Instagram|FB|IG)/gi;

function platformKey(word: string): 'fb' | 'th' | 'ig' | null {
  const w = word.toLowerCase();
  if (w === 'fb' || w === 'facebook') return 'fb';
  if (w === 'threads') return 'th';
  if (w === 'ig' || w === 'instagram') return 'ig';
  return null;
}

export function parseSocialAccount(raw: string) {
  const result = { fbUser: '', fbPass: '', thUser: '', thPass: '', igUser: '', igPass: '', legacyRaw: '' };
  if (!raw || !raw.trim()) return result;

  const hits: { key: 'fb' | 'th' | 'ig'; index: number }[] = [];
  let m: RegExpExecArray | null;
  PLATFORM_RE.lastIndex = 0;
  while ((m = PLATFORM_RE.exec(raw))) {
    const key = platformKey(m[1]);
    if (key) hits.push({ key, index: m.index });
  }
  if (hits.length === 0) {
    result.legacyRaw = raw;
    return result;
  }

  let anyOk = false;
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : raw.length;
    const span = raw.slice(start, end);
    // 帳號/密碼值：停在下一個空白、逗號或字串結尾（不是只有逗號），才能吃到換行或空格分隔的舊格式
    const userMatch = span.match(/帳號[:：\s]*([^\s，,；;]+)/);
    const passMatch = span.match(/密碼[:：\s]*([^\s，,；;]+)/);
    let user = userMatch?.[1]?.trim() || '';
    let pass = passMatch?.[1]?.trim() || '';
    if (!user && !pass) {
      // 沒有「帳號/密碼」字樣的更舊格式，例如 IG:帳號,密碼:FB:帳號,密碼——去掉平台名稱與頭尾冒號後
      // 剩下的內容按逗號切成「帳號,密碼」兩段。
      const stripped = span
        .replace(/^\s*(Facebook|Threads|Instagram|FB|IG)\s*[:：]?\s*/i, '')
        .replace(/[:：；;\s]+$/, '');
      const parts = stripped.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      if (parts[0]) {
        user = parts[0];
        pass = parts[1] || '';
      }
    }
    if (!user && !pass) continue;
    anyOk = true;
    const key = hits[i].key;
    if (key === 'fb') {
      result.fbUser = result.fbUser || user;
      result.fbPass = result.fbPass || pass;
    } else if (key === 'th') {
      result.thUser = result.thUser || user;
      result.thPass = result.thPass || pass;
    } else {
      result.igUser = result.igUser || user;
      result.igPass = result.igPass || pass;
    }
  }
  if (!anyOk) result.legacyRaw = raw;
  return result;
}

export function buildSocialAccount(fields: {
  fb_user?: string; fb_pass?: string;
  th_user?: string; th_pass?: string;
  ig_user?: string; ig_pass?: string;
}) {
  const parts: string[] = [];
  if (fields.fb_user?.trim() && fields.fb_pass?.trim()) {
    parts.push(`FB：帳號 ${fields.fb_user.trim()}，密碼 ${fields.fb_pass.trim()}`);
  }
  if (fields.th_user?.trim() && fields.th_pass?.trim()) {
    parts.push(`Threads：帳號 ${fields.th_user.trim()}，密碼 ${fields.th_pass.trim()}`);
  }
  if (fields.ig_user?.trim() && fields.ig_pass?.trim()) {
    parts.push(`IG：帳號 ${fields.ig_user.trim()}，密碼 ${fields.ig_pass.trim()}`);
  }
  return parts.join('；');
}
