import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid, upsertClientByLineUid } from '@/lib/aiEditorDb';

// 客戶資料設定：合併原本「建立／查詢／修改」三條路成一個表單。
// social_account 資料庫仍是單一自由文字欄位，這裡把 FB/Threads/IG 帳號密碼序列化成
// 「FB：帳號 x，密碼 y；Threads：...」的固定格式存進去，讀取時再盡量解析回三個欄位；
// 解析不出來（例如舊資料是聊天貼上的自由格式）就整段原文顯示，不會憑空清空。
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function parseSocialAccount(raw: string) {
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
    const userMatch = span.match(/帳號[:：\s]*([^\s，,]+)/);
    const passMatch = span.match(/密碼[:：\s]*([^\s，,]+)/);
    const user = userMatch?.[1]?.trim() || '';
    const pass = passMatch?.[1]?.trim() || '';
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

function buildSocialAccount(fields: {
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

export async function GET(req: NextRequest) {
  const lineUid = req.nextUrl.searchParams.get('line_uid');
  if (!lineUid || !lineUid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }

  const client = getClientByLineUid(lineUid.trim());
  if (!client) {
    return NextResponse.json({ exists: false });
  }

  const parsed = parseSocialAccount(client.social_account || '');
  return NextResponse.json({
    exists: true,
    name: client.name,
    keywords: client.keywords,
    persona: client.persona,
    client_info: client.client_info,
    recent_activities: client.recent_activities,
    fb_group_url: client.fb_group_url,
    ...parsed,
    connections: {
      fb: !!client.meta_access_token,
      threads: !!client.threads_access_token,
      ig: !!client.ig_access_token,
    },
    billing: {
      status: client.billing_status,
      amount: client.billing_amount,
      next_charge_date: client.next_charge_date,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    line_uid?: string;
    name?: string;
    keywords?: string;
    persona?: string;
    client_info?: string;
    recent_activities?: string;
    fb_group_url?: string;
    fb_user?: string; fb_pass?: string;
    th_user?: string; th_pass?: string;
    ig_user?: string; ig_pass?: string;
  };

  const line_uid = body.line_uid?.trim();
  if (!line_uid) return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  if (!body.name?.trim() || !body.keywords?.trim() || !body.persona?.trim()) {
    return NextResponse.json({ error: '客戶名稱、產業關鍵字、品牌小編人設為必填' }, { status: 400 });
  }

  const hasAnyPlatform =
    (body.fb_user?.trim() && body.fb_pass?.trim()) ||
    (body.th_user?.trim() && body.th_pass?.trim()) ||
    (body.ig_user?.trim() && body.ig_pass?.trim());

  const existing = getClientByLineUid(line_uid);

  let social_account: string;
  if (hasAnyPlatform) {
    social_account = buildSocialAccount(body);
  } else if (existing) {
    // 沒有動任何平台帳密欄位 → 保留原本的值，避免存檔時誤清空
    social_account = existing.social_account;
  } else {
    return NextResponse.json({ error: '請至少填寫一種社群平台的帳號密碼' }, { status: 400 });
  }

  const { action } = upsertClientByLineUid(line_uid, {
    name: body.name.trim(),
    social_account,
    keywords: body.keywords.trim(),
    persona: body.persona.trim(),
    client_info: body.client_info?.trim() || '',
    recent_activities: body.recent_activities?.trim() || '',
    fb_group_url: body.fb_group_url?.trim() || '',
  });

  return NextResponse.json({ ok: true, action });
}
