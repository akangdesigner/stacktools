import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid, upsertClientByLineUid } from '@/lib/aiEditorDb';
import { parseSocialAccount } from '@/lib/socialAccount';

// 客戶資料設定：合併原本「建立／查詢／修改」三條路成一個表單。
// FB/Threads/IG 帳號密碼一律讀寫 fb_user/fb_pass/th_user/th_pass/ig_user/ig_pass 真欄位。
// social_account 只留給尚未遷移的舊資料當備份：6 個真欄位都空但 social_account 有內容時，
// 用 lib/socialAccount.ts 的解析器暫時轉出來顯示，使用者存檔後就會正式寫進真欄位、完成遷移。
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const lineUid = req.nextUrl.searchParams.get('line_uid');
  if (!lineUid || !lineUid.trim()) {
    return NextResponse.json({ error: '缺少 line_uid' }, { status: 400 });
  }

  const client = getClientByLineUid(lineUid.trim());
  if (!client) {
    return NextResponse.json({ exists: false });
  }

  const hasRealColumns = client.fb_user || client.fb_pass || client.th_user || client.th_pass || client.ig_user || client.ig_pass;
  const accounts = hasRealColumns
    ? { fbUser: client.fb_user, fbPass: client.fb_pass, thUser: client.th_user, thPass: client.th_pass, igUser: client.ig_user, igPass: client.ig_pass, legacyRaw: '' }
    : parseSocialAccount(client.social_account || '');

  return NextResponse.json({
    exists: true,
    name: client.name,
    keywords: client.keywords,
    persona: client.persona,
    client_info: client.client_info,
    recent_activities: client.recent_activities,
    fb_group_url: client.fb_group_url,
    ...accounts,
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
  if (!existing && !hasAnyPlatform) {
    return NextResponse.json({ error: '請至少填寫一種社群平台的帳號密碼' }, { status: 400 });
  }

  const { action } = upsertClientByLineUid(line_uid, {
    name: body.name.trim(),
    fb_user: body.fb_user?.trim() || '',
    fb_pass: body.fb_pass?.trim() || '',
    th_user: body.th_user?.trim() || '',
    th_pass: body.th_pass?.trim() || '',
    ig_user: body.ig_user?.trim() || '',
    ig_pass: body.ig_pass?.trim() || '',
    keywords: body.keywords.trim(),
    persona: body.persona.trim(),
    client_info: body.client_info?.trim() || '',
    recent_activities: body.recent_activities?.trim() || '',
    fb_group_url: body.fb_group_url?.trim() || '',
  });

  return NextResponse.json({ ok: true, action });
}
