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

    // JSON body：表單欄位與系統欄位分鍵，避免與純文字「標題：…」混在同一串造成 n8n 對錯欄位
    const webhookPayload = {
      title,
      keywords,
      searchTerm,
      requiredBrand: requiredBrand ?? '',
      introLink: introLink ?? '',
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
