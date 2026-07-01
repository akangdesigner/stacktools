export const dynamic = 'force-dynamic';

// 綠界付款完成後，用戶「瀏覽器」被導回的頁面（OrderResultURL）。
// 這頁是給客戶看的（客戶在手機/LINE 開啟），顯示授權成功或失敗的友善訊息。
// 注意：這只是畫面，真正的狀態更新是靠 callback（server 對 server），不能只靠這頁。

import { NextRequest, NextResponse } from 'next/server';

function page(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? '#16a34a' : '#dc2626';
  const icon = ok ? '✓' : '✕';
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,'PingFang TC',sans-serif;background:#f9fafb;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;background:#fff;padding:40px 32px;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);max-width:340px;width:88%">
    <div style="width:56px;height:56px;border-radius:50%;background:${color};color:#fff;font-size:28px;line-height:56px;margin:0 auto 16px">${icon}</div>
    <h1 style="font-size:18px;color:#111;margin:0 0 8px">${title}</h1>
    <p style="font-size:14px;color:#6b7280;margin:0;line-height:1.6">${message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handle(req: NextRequest): Promise<NextResponse> {
  let rtnCode = '';
  // 綠界以 POST form 導回；GET 時則從 query 讀（容錯）
  if (req.method === 'POST') {
    try {
      const fd = await req.formData();
      rtnCode = String(fd.get('RtnCode') ?? '');
    } catch {
      rtnCode = '';
    }
  } else {
    rtnCode = req.nextUrl.searchParams.get('RtnCode') ?? '';
  }

  if (rtnCode === '1') {
    return page('付款設定完成', '感謝您！自動扣款已設定成功，之後每月會自動續扣，無需再手動處理。', true);
  }
  return page('付款未完成', '這次授權未成功，可能是取消或卡片問題。請重新點擊授權連結，或與我們聯繫。', false);
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
