export const dynamic = 'force-dynamic';

// 產生綠界「信用卡定期定額」授權入口。
// 這是一條可分享的 GET 連結（例：/api/ai-editor/billing/create?clientId=15），
// 傳給客戶 → 客戶點開 → 自動導向綠界刷卡頁授權一次 → 之後綠界每月自動扣款。

import { NextRequest, NextResponse } from 'next/server';
import { getAiEditorClient, updateClientBilling } from '@/lib/aiEditorDb';
import { buildPeriodCheckoutParams } from '@/lib/ecpay';

// 避免客戶名稱含特殊字元破壞 HTML 表單
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 簡單的錯誤頁（用戶會直接在瀏覽器看到）
function errorPage(message: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>無法建立付款</title></head><body style="font-family:sans-serif;text-align:center;margin-top:60px;color:#333"><p>${escapeHtml(message)}</p></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const clientId = Number(req.nextUrl.searchParams.get('clientId'));
  if (!clientId) return errorPage('連結不正確：缺少 clientId', 400);

  const client = getAiEditorClient(clientId);
  if (!client) return errorPage('找不到這位客戶，請確認連結是否正確', 404);

  // 回呼網址必須是公開網址（綠界要打得到）。優先用 ECPAY_BASE_URL，其次用目前來源網址。
  // 本機 localhost 綠界收不到回呼，正式驗證請在 Zeabur 線上進行。
  const baseUrl = process.env.ECPAY_BASE_URL || req.nextUrl.origin;

  const { action, params, merchantTradeNo } = buildPeriodCheckoutParams({
    clientId: client.id,
    clientName: client.name,
    baseUrl,
    amount: client.billing_amount || undefined, // 預設 3000，除非該客戶另設金額
  });

  // 記下這次的交易編號、狀態轉為「待授權」
  updateClientBilling(client.id, {
    billing_status: 'pending',
    ecpay_trade_no: merchantTradeNo,
  });

  // 產生自動送出的表單，把用戶導去綠界刷卡頁
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('\n');

  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>前往綠界安全付款…</title></head>
<body style="font-family:sans-serif;text-align:center;margin-top:60px;color:#333">
  <p>正在前往綠界安全付款頁，請稍候…</p>
  <form id="ecpay-form" method="post" action="${action}">
${inputs}
  </form>
  <script>document.getElementById('ecpay-form').submit();</script>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
