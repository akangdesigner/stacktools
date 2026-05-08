import { NextRequest, NextResponse } from 'next/server';
import { getClient, setJobProcessing } from '@/lib/blogGenDb';

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getClient(Number(clientId));
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const webhookUrl = process.env.BLOG_GEN_WEBHOOK_URL;
  const webhookTestUrl = process.env.BLOG_GEN_WEBHOOK_TEST_URL;
  if (!webhookUrl && !webhookTestUrl) {
    return NextResponse.json({ error: '尚未設定 BLOG_GEN_WEBHOOK_URL' }, { status: 500 });
  }

  const jobId = crypto.randomUUID();
  const callbackBase = process.env.BLOG_GEN_CALLBACK_BASE_URL || req.nextUrl.origin;
  const callbackUrl = `${callbackBase}/api/blog-gen/callback`;

  const chatInput = [
    `客戶名稱：${client.name}`,
    `Word 網址：${client.word_url}`,
    `GDrive 圖片：${client.gdrive_url}`,
    `小編人設：${client.persona}`,
    `任務ID：${jobId}`,
    `狀態回傳網址：${callbackUrl}`,
  ].join('\n');

  const payload = JSON.stringify({ chatInput, jobId, callbackUrl });

  try {
    const primaryUrl = webhookUrl ?? webhookTestUrl!;
    let response = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: payload,
    });

    // 正式 URL 回 404 時 fallback 到測試 URL
    if (webhookUrl && response.status === 404 && webhookTestUrl) {
      response = await fetch(webhookTestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: payload,
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `n8n webhook 呼叫失敗（HTTP ${response.status}）：${errText || '未知錯誤'}` },
        { status: 502 }
      );
    }

    setJobProcessing(Number(clientId), jobId);
    return NextResponse.json({ jobId, status: 'processing' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
