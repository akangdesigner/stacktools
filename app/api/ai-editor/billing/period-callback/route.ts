export const dynamic = 'force-dynamic';

// 綠界「每期自動扣款」結果回呼（PeriodReturnURL，server 對 server）。
// 授權成功後，綠界每個週期自動扣款一次，每次都會 POST 結果到這裡。
// 驗簽 → 更新最近扣款時間/下次扣款日（成功）或轉 failed（失敗）→ 回 "1|OK"。

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, getClientByTradeNo, updateClientBilling, type AiEditorClient } from '@/lib/aiEditorDb';
import { verifyCheckMacValue, twNow, twDatePlusMonths } from '@/lib/ecpay';

function ack(ok: boolean, msg = 'OK'): NextResponse {
  return new NextResponse(ok ? '1|OK' : `0|${msg}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function parseForm(req: NextRequest): Promise<Record<string, string>> {
  const fd = await req.formData();
  const obj: Record<string, string> = {};
  for (const [k, v] of fd.entries()) obj[k] = String(v);
  return obj;
}

function resolveClient(params: Record<string, string>): AiEditorClient | null {
  const cid = Number(params.CustomField1);
  if (cid) {
    const c = getAiEditorClient(cid);
    if (c) return c;
  }
  if (params.MerchantTradeNo) return getClientByTradeNo(params.MerchantTradeNo);
  return null;
}

export async function POST(req: NextRequest) {
  const params = await parseForm(req);

  if (!verifyCheckMacValue(params)) return ack(false, 'CheckMacValue error');

  const client = resolveClient(params);
  if (!client) return ack(true);

  // RtnCode=1 代表本期扣款成功
  if (params.RtnCode === '1') {
    const card4 = params.Card4No || params.card4no || client.card_last4;
    updateClientBilling(client.id, {
      billing_status: 'active',
      card_last4: card4,
      last_charge_at: twNow(),
      next_charge_date: twDatePlusMonths(1),
    });
  } else {
    // 本期扣款失敗（例如卡片過期、額度不足）
    updateClientBilling(client.id, { billing_status: 'failed' });
  }

  return ack(true);
}
