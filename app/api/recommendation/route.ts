import { NextRequest, NextResponse } from 'next/server';
import { createRecommendationJob, updateRecommendationJob } from '@/lib/recommendation-jobs';

export async function POST(req: NextRequest) {
  const {
    title,
    keywords,
    searchTerm,
    requiredBrand,
    introLink,
  } = await req.json();

  if (!title || !keywords || !searchTerm) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookTestUrl = process.env.N8N_WEBHOOK_TEST_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: '尚未設定 N8N_WEBHOOK_URL' }, { status: 500 });
  }

  try {
    const jobId = crypto.randomUUID();
    const callbackBaseUrl = process.env.RECOMMENDATION_CALLBACK_BASE_URL || req.nextUrl.origin;
    const callbackUrl = `${callbackBaseUrl}/api/recommendation/callback`;

    // n8n：chatInput 為完整標籤字串；請在 extractContent 的 lookahead 加入「任務ID|狀態回傳網址」等標籤。
    const brand = (requiredBrand ?? '').trim();
    const intro = (introLink ?? '').trim();
    const chatInput = [
      `標題：${title}`,
      `品牌：${brand}`,
      `關鍵字：${keywords}`,
      `搜尋項目：${searchTerm}`,
      `前言連結：${intro}`,
      `任務ID：${jobId}`,
      `狀態回傳網址：${callbackUrl}`,
    ].join('\n');

    const webhookPayload = {
      chatInput,
      jobId,
      callbackUrl,
    };
    const webhookBody = JSON.stringify(webhookPayload);

    let response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: webhookBody,
    });

    // Fallback for local/dev usage when production webhook is not active yet.
    if (response.status === 404 && webhookTestUrl) {
      response = await fetch(webhookTestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: webhookBody,
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      createRecommendationJob(jobId, '需求送出失敗');
      updateRecommendationJob(
        jobId,
        'failed',
        `需求送出失敗（HTTP ${response.status}）：${errText || '未知錯誤'}`
      );
      return NextResponse.json(
        { error: `n8n webhook 呼叫失敗（HTTP ${response.status}）：${errText || "未知錯誤"}` },
        { status: 502 }
      );
    }

    createRecommendationJob(jobId, '需求已送出，文章生成中');
    return NextResponse.json({
      jobId,
      status: 'processing',
      letter: '需求已送出，文章生成中',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
