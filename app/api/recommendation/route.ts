import { NextRequest, NextResponse } from 'next/server';
import { createRecommendationJob } from '@/lib/recommendation-jobs';
import { generateBrands, generateOutline } from '@/lib/recommendation-step1';

export async function POST(req: NextRequest) {
  const { title, keywords, searchTerm, requiredBrand, introLink } = await req.json();

  if (!title || !keywords || !searchTerm) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const input = {
    title: String(title).trim(),
    keywords: String(keywords).trim(),
    searchTerm: String(searchTerm).trim(),
    requiredBrand: String(requiredBrand ?? '').trim(),
    introLink: String(introLink ?? '').trim(),
  };

  createRecommendationJob(jobId, input);

  // 品牌查詢／大綱生成改本地跑（不再靠 n8n agent），各自 fire-and-forget 寫回 job
  generateBrands(jobId, input).catch((err) => {
    console.error(`[generateBrands] jobId=${jobId} 未捕捉例外：`, err);
  });
  generateOutline(jobId, input).catch((err) => {
    console.error(`[generateOutline] jobId=${jobId} 未捕捉例外：`, err);
  });

  return NextResponse.json({
    jobId,
    status: 'researching',
    message: '正在查詢品牌與生成大綱',
  });
}
