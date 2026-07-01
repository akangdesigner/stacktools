export const dynamic = 'force-dynamic';

// 給 LINE 圖文選單流程（n8n）用的扣款狀態查詢。
// 用 lineUid（= LINE userId）查該客戶的自動扣款狀態、到期/下次扣款日，
// 並附上一條可直接給客戶點的授權連結（pay_url）。
// n8n 只要一支 HTTP GET 就能拿到渲染 Flex 卡片所需的全部資料。

import { NextRequest, NextResponse } from 'next/server';
import { getClientByLineUid } from '@/lib/aiEditorDb';

// 狀態中文對照，方便 n8n 直接顯示
const STATUS_LABEL: Record<string, string> = {
  none: '尚未設定',
  pending: '待授權',
  active: '扣款中',
  failed: '扣款失敗',
  cancelled: '已取消',
};

export async function GET(req: NextRequest) {
  const lineUid = req.nextUrl.searchParams.get('lineUid')?.trim() ?? '';
  if (!lineUid) {
    return NextResponse.json({ found: false, error: '缺少 lineUid' }, { status: 400 });
  }

  const client = getClientByLineUid(lineUid);
  if (!client) {
    return NextResponse.json({ found: false });
  }

  const baseUrl = process.env.ECPAY_BASE_URL || req.nextUrl.origin;
  const amount = client.billing_amount || 3000;

  return NextResponse.json({
    found: true,
    client_id: client.id,
    name: client.name,
    billing_status: client.billing_status,
    billing_status_label: STATUS_LABEL[client.billing_status] ?? client.billing_status,
    amount,
    card_last4: client.card_last4 || '',
    last_charge_at: client.last_charge_at || '',
    next_charge_date: client.next_charge_date || '',
    // 授權連結：客戶點開 → 綠界刷卡授權 → 之後每月自動扣款
    pay_url: `${baseUrl}/api/ai-editor/billing/create?clientId=${client.id}`,
  });
}
