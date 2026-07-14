import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid, upsertClientByLineUid } from '@/lib/aiEditorDb';
import { parseSocialAccount, buildSocialAccount } from '@/lib/socialAccount';

// 客戶資料設定：合併原本「建立／查詢／修改」三條路成一個表單。
// social_account 序列化/解析邏輯共用於 lib/socialAccount.ts（內部管理頁 /ai-editor/[id] 也用同一套）。
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
