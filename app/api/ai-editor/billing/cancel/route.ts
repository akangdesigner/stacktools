import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, getClientByLineUid, updateClientBilling } from '@/lib/aiEditorDb';
import { cancelPeriod } from '@/lib/ecpay';

export const dynamic = 'force-dynamic';

// 停止某客戶的每月自動扣款。
// 兩種識別：後台頁傳 clientId；客戶自助 LIFF 頁傳 lineUid（用 LINE 身分，客戶只能停自己那筆，
// 避免前端竄改 clientId 停到別人的委託）。
// 流程：查客戶 → 呼叫綠界新版「定期定額訂單作業」停用委託 →
// 只有綠界回 RtnCode=1（真的停用成功）才把 billing_status 設為 cancelled，
// 避免出現「DB 顯示已停、綠界卻還在扣」的危險不一致。
export async function POST(req: NextRequest) {
  const { clientId, lineUid } = (await req.json()) as { clientId?: number; lineUid?: string };
  const uid = lineUid?.trim();
  if (!uid && !clientId) {
    return NextResponse.json({ ok: false, error: '缺少 lineUid 或 clientId' }, { status: 400 });
  }

  // lineUid 優先（客戶自助頁），其次 clientId（公司後台）
  const client = uid ? getClientByLineUid(uid) : getAiEditorClient(Number(clientId));
  if (!client) {
    return NextResponse.json({ ok: false, error: '找不到客戶' }, { status: 404 });
  }
  if (client.billing_status !== 'active') {
    return NextResponse.json({ ok: false, error: '此客戶目前不是扣款中狀態，無需停用' }, { status: 409 });
  }
  if (!client.ecpay_trade_no) {
    return NextResponse.json({ ok: false, error: '查無綠界委託單號，無法自動停用，請改用綠界後台終止' }, { status: 409 });
  }

  const result = await cancelPeriod(client.ecpay_trade_no);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: '呼叫綠界停用失敗（連線或回應異常），請稍後再試或改用綠界後台終止' },
      { status: 502 }
    );
  }
  if (result.RtnCode !== 1) {
    return NextResponse.json(
      { ok: false, error: `綠界停用未成功：${result.RtnMsg || '未知錯誤'}（RtnCode ${result.RtnCode}）` },
      { status: 502 }
    );
  }

  // 綠界確實停用後才更新本地狀態
  updateClientBilling(client.id, { billing_status: 'cancelled' });
  return NextResponse.json({ ok: true, message: '已停止此客戶的自動扣款' });
}
