export const dynamic = 'force-dynamic';

// 綠界「首次授權」結果回呼（ReturnURL，server 對 server）。
// 客戶在綠界刷卡授權完成後，綠界會 POST 結果到這裡。
// 我們驗證簽章 → 授權成功轉 active、記卡號末四碼 → 回傳 "1|OK" 讓綠界知道已收到。

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, getClientByTradeNo, updateClientBilling, type AiEditorClient } from '@/lib/aiEditorDb';
import { verifyCheckMacValue, twNow, twDatePlusMonths } from '@/lib/ecpay';

// 綠界要求回覆純文字 "1|OK" 表示已成功接收，否則會重複重送
function ack(ok: boolean, msg = 'OK'): NextResponse {
  return new NextResponse(ok ? '1|OK' : `0|${msg}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// 把綠界的 form-urlencoded 內容轉成純字串物件
async function parseForm(req: NextRequest): Promise<Record<string, string>> {
  const fd = await req.formData();
  const obj: Record<string, string> = {};
  for (const [k, v] of fd.entries()) obj[k] = String(v);
  return obj;
}

// 對應是哪個客戶：優先用自訂欄位 CustomField1(client id)，其次用交易編號反查
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

  // 1. 驗簽：不對就拒絕（可能是偽造請求）
  if (!verifyCheckMacValue(params)) return ack(false, 'CheckMacValue error');

  // 2. 找出客戶；找不到仍回 1|OK 避免綠界不斷重送（實務上應記 log 追查）
  const client = resolveClient(params);
  if (!client) return ack(true);

  // 3. 依授權結果更新狀態（RtnCode=1 代表授權成功）
  if (params.RtnCode === '1') {
    // 卡號末四碼欄位名稱綠界文件有 Card4No / card4no 兩種寫法，都容錯讀取
    const card4 = params.Card4No || params.card4no || client.card_last4;
    updateClientBilling(client.id, {
      billing_status: 'active',
      card_last4: card4,
      last_charge_at: twNow(),
      next_charge_date: twDatePlusMonths(1), // 估算下期扣款日（每月）
    });
  } else {
    updateClientBilling(client.id, { billing_status: 'failed' });
  }

  return ack(true);
}
