import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TavilyResult = { title: string; url: string; content: string };
type TavilyResponse = { results?: TavilyResult[] };

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')?.trim();
  const type = req.nextUrl.searchParams.get('type') ?? 'competitor';
  if (!keyword) return NextResponse.json({ error: '缺少 keyword' }, { status: 400 });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '未設定 TAVILY_API_KEY' }, { status: 500 });

  const isAuthority = type === 'authority';

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: isAuthority
        ? `${keyword} 研究 論文 衛生福利部 OR 食藥署 OR 疾管署 OR 國健署 OR pubmed OR WHO OR 衛生局`
        : keyword,
      search_depth: isAuthority ? 'advanced' : 'basic',
      include_answer: false,
      max_results: isAuthority ? 8 : 10,
      ...(isAuthority && {
        include_domains: [
          'mohw.gov.tw', 'hpa.gov.tw', 'fda.gov.tw', 'cdc.gov.tw',
          'gov.tw', 'edu.tw',
          'who.int', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov',
          'health.gov', 'nih.gov',
        ],
      }),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Tavily 錯誤：${err}` }, { status: 502 });
  }

  const data = await res.json() as TavilyResponse;
  return NextResponse.json({ results: data.results ?? [] });
}
