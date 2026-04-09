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
    const contentLines = [
      `標題：${title}`,
      `關鍵字：${keywords}`,
      `搜尋項目：${searchTerm}`,
      `任務ID：${jobId}`,
      `狀態回傳網址：${callbackUrl}`,
    ];
    if (requiredBrand) contentLines.push(`品牌：${requiredBrand}`);
    if (introLink) contentLines.push(`前言連結：${introLink}`);
    const contentBlock = contentLines.join('\n');

    let response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: contentBlock,
    });

    // Fallback for local/dev usage when production webhook is not active yet.
    if (response.status === 404 && webhookTestUrl) {
      response = await fetch(webhookTestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: contentBlock,
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
