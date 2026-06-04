import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TavilyResult = { title: string; url: string; content: string };
type TavilyResponse = { results?: TavilyResult[] };

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')?.trim();
  if (!keyword) return NextResponse.json({ error: '缺少 keyword' }, { status: 400 });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '未設定 TAVILY_API_KEY' }, { status: 500 });

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: keyword,
      search_depth: 'basic',
      include_answer: false,
      max_results: 6,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Tavily 錯誤：${err}` }, { status: 502 });
  }

  const data = await res.json() as TavilyResponse;
  return NextResponse.json({ results: data.results ?? [] });
}
